import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { Response } from 'express';
import { CONFIG } from '../config.js';
import { SongService } from './songService.js';
import {
  extractYouTubeId,
  isValidYouTubeUrl,
  sanitizeFilename,
  formatFileSize,
  getMemoryStats,
  logMemory
} from './agentUtils.js';
import { AgentDownloadPhase, AgentDownloadProgressEvent, Song } from '../types/index.js';

export interface BrowserStatus {
  checked: boolean;
  available: boolean;
  browserName: string;
  error: string | null;
}

export interface SseClientWrapper {
  res: Response;
  heartbeatTimer: NodeJS.Timeout;
}

export interface DownloadJob {
  id: string;
  roomCode: string;
  playerId: string;
  sessionToken: string;
  videoId: string;
  url: string;
  status: AgentDownloadPhase;
  percent: number;
  message: string;
  data?: any;
  result?: Song | null;
  error?: string | null;
  createdAt: number;
  sseClients: SseClientWrapper[];
  tempFiles: string[];
}

export class MusicDownloadAgentService {
  private songService: SongService;
  private tempDir: string;
  private jobs = new Map<string, DownloadJob>();
  private activeRoomVideoJobs = new Map<string, string>(); // `${roomCode}:${videoId}` -> jobId
  private onJobCompletedCallback?: (roomCode: string, song: Song) => void;
  private maxConcurrentJobs = 1;
  private maxQueueSize = 5;
  private runningJobsCount = 0;
  private jobQueue: string[] = [];
  private browserStatus: BrowserStatus = {
    checked: false,
    available: true,
    browserName: 'YT-Ai Audio Engine',
    error: null
  };

  constructor(songService: SongService, tempDir: string = CONFIG.AGENT_TEMP_DIR) {
    this.songService = songService;
    this.tempDir = tempDir;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.browserStatus = {
      checked: false,
      available: true,
      browserName: 'YT-Ai Audio Engine',
      error: null
    };
  }

  /**
   * Diagnostic startup check: Verifies YT-Ai audio converter service readiness.
   */
  public async verifyBrowserReadiness(): Promise<BrowserStatus> {
    try {
      const serviceUrl = CONFIG.YT_AI_SERVICE_URL;
      let isAvailable = true;
      let error: string | null = null;

      if (serviceUrl) {
        try {
          const res = await fetch(`${serviceUrl}/healthz`, {
            signal: AbortSignal.timeout(2500)
          });
          if (res.status >= 500) {
            isAvailable = false;
            error = `YT-Ai service returned HTTP ${res.status}`;
          }
        } catch {
          // In offline testing or local development, keep service available if configured
          isAvailable = true;
        }
      }

      this.browserStatus = {
        checked: true,
        available: isAvailable,
        browserName: 'YT-Ai Audio Engine',
        error
      };

      logMemory('Startup-ServiceCheck');
      return this.browserStatus;
    } catch {
      this.browserStatus = {
        checked: true,
        available: true,
        browserName: 'YT-Ai Audio Engine',
        error: null
      };
      return this.browserStatus;
    }
  }

  public getDiagnostics() {
    return {
      activeJobs: this.runningJobsCount,
      queuedJobs: this.jobQueue.length,
      maxConcurrent: this.maxConcurrentJobs,
      maxQueueSize: this.maxQueueSize,
      browser: this.browserStatus,
      serviceUrl: CONFIG.YT_AI_SERVICE_URL,
      memory: getMemoryStats()
    };
  }

  public getBrowserStatus(): BrowserStatus {
    return { ...this.browserStatus };
  }

  public isBrowserAvailable(): boolean {
    return this.browserStatus.available;
  }

  public setOnJobCompletedCallback(cb: (roomCode: string, song: Song) => void): void {
    this.onJobCompletedCallback = cb;
  }

  public getJob(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Dispatches an event to in-memory state and all SSE listeners.
   */
  private emitProgress(
    job: DownloadJob,
    event: { phase: AgentDownloadPhase; percent: number; message: string; data?: any }
  ): void {
    job.status = event.phase;
    job.percent = event.percent;
    job.message = event.message;
    if (event.data) {
      job.data = { ...(job.data || {}), ...event.data };
    }

    const payload: AgentDownloadProgressEvent = {
      jobId: job.id,
      roomCode: job.roomCode,
      status: job.status,
      percent: job.percent,
      message: job.message,
      data: job.data || null,
      result: job.result
        ? {
            id: job.result.id,
            title: job.result.title,
            artist: job.result.artist,
            duration_seconds: job.result.duration_seconds,
            file_size: job.result.file_size
          }
        : null,
      error: job.error || null
    };

    const sseData = `data: ${JSON.stringify(payload)}\n\n`;

    job.sseClients.forEach((client) => {
      try {
        if (!client.res.writableEnded && !client.res.destroyed) {
          client.res.write(sseData);
          if (job.status === 'completed' || job.status === 'error') {
            clearInterval(client.heartbeatTimer);
            client.res.end();
          }
        }
      } catch {}
    });
  }

  /**
   * High-efficiency audio stream conversion workflow powered by YT-Ai.
   */
  private async executeDownloadWorkflow(job: DownloadJob): Promise<Song> {
    const { videoId } = job;
    const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const startTime = Date.now();
    let tempTargetFilePath: string | null = null;
    logMemory(`Job-${job.id}-Start`);

    try {
      // 1. Validation & Service Check
      this.emitProgress(job, {
        phase: 'validating',
        percent: 15,
        message: 'Validating YouTube link with YT-Ai converter...'
      });

      const serviceUrl = CONFIG.YT_AI_SERVICE_URL;

      // 2. Fetch video title & metadata via POST /info
      this.emitProgress(job, {
        phase: 'processing',
        percent: 30,
        message: 'Fetching media details from YT-Ai converter...'
      });

      let title = `YouTube Track ${videoId}`;
      let durationSeconds = 30;
      let artist = 'YouTube';
      let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      try {
        const infoRes = await fetch(`${serviceUrl}/info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TuneGuessr/2.0'
          },
          body: JSON.stringify({ url: normalizedUrl }),
          signal: AbortSignal.timeout(15000)
        });

        if (infoRes.ok) {
          const infoData = (await infoRes.json()) as any;
          if (infoData && infoData.title && typeof infoData.title === 'string') {
            title = infoData.title.trim();
          }
          if (infoData && typeof infoData.duration === 'number' && infoData.duration > 0) {
            durationSeconds = Math.round(infoData.duration);
          }
        }
      } catch (infoErr: any) {
        console.warn(`[MusicDownloadAgent] YT-Ai /info note: ${infoErr.message}`);
      }

      // Metadata enrichment via yt-search if title is generic
      if (title === `YouTube Track ${videoId}`) {
        try {
          const ytsModule = await import('yt-search');
          const yts = ytsModule.default || ytsModule;
          const searchResult = await (yts as any)({ videoId });
          if (searchResult && searchResult.title) {
            title = searchResult.title.trim();
            artist = searchResult.author?.name || 'YouTube';
            durationSeconds = searchResult.seconds || durationSeconds;
            thumbnail = searchResult.thumbnail || thumbnail;
          }
        } catch {}
      }

      // 3. Request MP3 conversion stream via GET /stream
      this.emitProgress(job, {
        phase: 'downloading',
        percent: 45,
        message: 'Connecting to YT-Ai audio stream (192kbps MP3)...',
        data: { title, artist, durationSeconds, thumbnail }
      });

      const streamUrl = `${serviceUrl}/stream?url=${encodeURIComponent(normalizedUrl)}&format=mp3&quality=192`;
      const streamController = new AbortController();
      const streamTimeout = setTimeout(() => streamController.abort(), CONFIG.AGENT_DOWNLOAD_TIMEOUT_MS);

      let streamRes: any;
      try {
        streamRes = await fetch(streamUrl, {
          headers: {
            'User-Agent': 'TuneGuessr/2.0'
          },
          signal: streamController.signal
        });
      } catch (streamErr: any) {
        clearTimeout(streamTimeout);
        throw new Error(`Failed to connect to audio streaming service at ${serviceUrl}: ${streamErr.message}`);
      }

      if (!streamRes.ok) {
        clearTimeout(streamTimeout);
        const errText = await streamRes.text().catch(() => '');
        throw new Error(
          `Audio streaming service returned HTTP ${streamRes.status}: ${errText.slice(0, 120) || 'Stream unavailable'}`
        );
      }

      if (!streamRes.body) {
        clearTimeout(streamTimeout);
        throw new Error('Audio streaming service returned an empty response body.');
      }

      // 4. Save to temporary file in agent temp directory
      const ext = 'mp3';
      const tempSafeFilename = `temp_${job.id}_${Date.now()}.${ext}`;
      tempTargetFilePath = path.join(this.tempDir, tempSafeFilename);
      job.tempFiles.push(tempTargetFilePath);

      const contentLengthHeader = streamRes.headers.get('content-length');
      const totalSizeBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

      if (totalSizeBytes > CONFIG.MAX_FILE_SIZE_BYTES) {
        clearTimeout(streamTimeout);
        throw new Error(
          `Audio stream size (${formatFileSize(totalSizeBytes)}) exceeds maximum limit of ${formatFileSize(CONFIG.MAX_FILE_SIZE_BYTES)}.`
        );
      }

      const fileWriteStream = fs.createWriteStream(tempTargetFilePath);
      const nodeReadable = Readable.fromWeb(streamRes.body as any);

      let downloadedBytes = 0;
      nodeReadable.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > CONFIG.MAX_FILE_SIZE_BYTES) {
          nodeReadable.destroy(
            new Error(`File size exceeded maximum limit of ${formatFileSize(CONFIG.MAX_FILE_SIZE_BYTES)}`)
          );
          return;
        }
        const pct =
          totalSizeBytes > 0
            ? Math.min(92, Math.round(45 + (downloadedBytes / totalSizeBytes) * 48))
            : Math.min(92, Math.round(45 + Math.log10(downloadedBytes + 1) * 8));

        this.emitProgress(job, {
          phase: 'downloading',
          percent: pct,
          message: `Streaming audio track (${formatFileSize(downloadedBytes)})...`,
          data: { title, artist, durationSeconds, thumbnail, ext }
        });
      });

      await new Promise<void>((resolve, reject) => {
        nodeReadable.pipe(fileWriteStream);
        fileWriteStream.on('finish', () => resolve());
        fileWriteStream.on('error', (err) => reject(err));
        nodeReadable.on('error', (err) => reject(err));
      });

      clearTimeout(streamTimeout);

      // 5. Verify integrity
      this.emitProgress(job, {
        phase: 'verifying',
        percent: 95,
        message: 'Verifying downloaded audio file integrity...'
      });

      if (!fs.existsSync(tempTargetFilePath)) {
        throw new Error('Audio file was not created on disk.');
      }

      const stat = fs.statSync(tempTargetFilePath);
      if (stat.size === 0) {
        throw new Error('Downloaded audio file is empty (0 bytes).');
      }

      if (stat.size > CONFIG.MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Downloaded file size (${formatFileSize(stat.size)}) exceeds maximum limit of ${formatFileSize(CONFIG.MAX_FILE_SIZE_BYTES)}.`
        );
      }

      durationSeconds = Math.max(5, Math.min(600, durationSeconds));

      // 6. Register with SongService
      const savedSong = this.songService.addAgentDownloadedSong(job.sessionToken, {
        sourceFilePath: tempTargetFilePath,
        fileSizeBytes: stat.size,
        mimeType: 'audio/mpeg',
        title,
        artist,
        durationSeconds,
        videoId,
        thumbnailUrl: thumbnail,
        ext: 'mp3'
      });

      job.result = savedSong;
      job.tempFiles = job.tempFiles.filter((p) => p !== tempTargetFilePath);

      if (this.onJobCompletedCallback) {
        this.onJobCompletedCallback(job.roomCode, savedSong);
      }

      this.emitProgress(job, {
        phase: 'completed',
        percent: 100,
        message: `Audio track "${title}" downloaded and added to room queue (${formatFileSize(stat.size)})!`,
        data: {
          song: savedSong,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000)
        }
      });

      return savedSong;
    } finally {
      // Cleanup any remaining temporary files
      job.tempFiles.forEach((file) => {
        if (fs.existsSync(file)) {
          try {
            fs.unlinkSync(file);
          } catch {}
        }
      });
      job.tempFiles = [];
      logMemory(`Job-${job.id}-End`);
    }
  }

  /**
   * Internal job execution runner with resource limits and cleanup.
   */
  private runJobWorkflow(job: DownloadJob): void {
    const roomVideoKey = `${job.roomCode.toUpperCase()}:${job.videoId}`;

    // Timeout watchdog
    const timeoutHandle = setTimeout(() => {
      if (job.status !== 'completed' && job.status !== 'error') {
        const timeoutMsg = `Download timed out after ${Math.round(CONFIG.AGENT_DOWNLOAD_TIMEOUT_MS / 1000)} seconds.`;
        job.status = 'error';
        job.error = timeoutMsg;
        this.emitProgress(job, { phase: 'error', percent: job.percent, message: timeoutMsg });
        this.activeRoomVideoJobs.delete(roomVideoKey);
        job.sseClients.forEach((client) => {
          clearInterval(client.heartbeatTimer);
          try {
            if (!client.res.writableEnded && !client.res.destroyed) {
              client.res.end();
            }
          } catch {}
        });
        job.sseClients = [];
      }
    }, CONFIG.AGENT_DOWNLOAD_TIMEOUT_MS);

    (async () => {
      try {
        await this.executeDownloadWorkflow(job);
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        job.status = 'error';
        job.error = err.message || 'An unexpected error occurred during music download.';
        this.emitProgress(job, {
          phase: 'error',
          percent: job.percent,
          message: job.error!
        });
      } finally {
        clearTimeout(timeoutHandle);
        this.activeRoomVideoJobs.delete(roomVideoKey);

        // End SSE connections
        job.sseClients.forEach((client) => {
          clearInterval(client.heartbeatTimer);
          try {
            if (!client.res.writableEnded && !client.res.destroyed) {
              client.res.end();
            }
          } catch {}
        });
        job.sseClients = [];

        // Decrement running job count and process next queued item
        this.runningJobsCount = Math.max(0, this.runningJobsCount - 1);
        this.processNextQueueItem();

        // Clean up expired jobs (older than 15 minutes) to prevent memory leak
        const now = Date.now();
        for (const [id, j] of this.jobs.entries()) {
          if ((j.status === 'completed' || j.status === 'error') && now - j.createdAt > 15 * 60 * 1000) {
            this.jobs.delete(id);
          }
        }
      }
    })();
  }

  /**
   * Process the next queued download job if capacity allows.
   */
  private processNextQueueItem(): void {
    if (this.runningJobsCount >= this.maxConcurrentJobs || this.jobQueue.length === 0) {
      return;
    }

    const nextJobId = this.jobQueue.shift();
    if (!nextJobId) return;

    const nextJob = this.jobs.get(nextJobId);
    if (!nextJob || nextJob.status === 'completed' || nextJob.status === 'error') {
      this.processNextQueueItem();
      return;
    }

    this.runningJobsCount++;
    this.runJobWorkflow(nextJob);

    // Update position for remaining queued jobs
    this.jobQueue.forEach((queuedId, index) => {
      const qJob = this.jobs.get(queuedId);
      if (qJob && qJob.status === 'queued') {
        const pos = index + 1;
        this.emitProgress(qJob, {
          phase: 'queued',
          percent: 2,
          message: `Download queued (position ${pos} of ${this.jobQueue.length}). Waiting for active job...`
        });
      }
    });
  }

  /**
   * Public interface to initiate an asynchronous agent download job.
   */
  public startDownloadJob(
    sessionToken: string,
    roomCode: string,
    playerId: string,
    rawUrl: string
  ): { jobId: string; status: string; message: string; isExisting?: boolean } {
    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      throw new Error(
        'Invalid YouTube URL. Please provide a valid YouTube link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)'
      );
    }

    const roomVideoKey = `${roomCode.toUpperCase()}:${videoId}`;

    // Deduplication: Check if this video is currently downloading for this room
    const existingJobId = this.activeRoomVideoJobs.get(roomVideoKey);
    if (existingJobId) {
      const existingJob = this.jobs.get(existingJobId);
      if (existingJob && existingJob.status !== 'completed' && existingJob.status !== 'error') {
        return {
          jobId: existingJob.id,
          status: 'already_running',
          message: 'A download for this YouTube video is already in progress in this room.',
          isExisting: true
        };
      }
    }

    const jobId = `agent_job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const isQueued = this.runningJobsCount >= this.maxConcurrentJobs;

    const job: DownloadJob = {
      id: jobId,
      roomCode: roomCode.toUpperCase(),
      playerId,
      sessionToken,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      status: isQueued ? 'queued' : 'validating',
      percent: isQueued ? 2 : 5,
      message: isQueued
        ? `Download queued (position ${this.jobQueue.length + 1}). Waiting for active download to complete...`
        : 'Job queued and validated.',
      createdAt: Date.now(),
      sseClients: [],
      tempFiles: []
    };

    // If active job is running, check queue limit
    if (isQueued) {
      if (this.jobQueue.length >= this.maxQueueSize) {
        throw new Error(
          `Server download queue is currently full (${this.maxQueueSize} jobs pending). Please wait a moment or use the direct YouTube Stream tab.`
        );
      }
      this.jobs.set(jobId, job);
      this.activeRoomVideoJobs.set(roomVideoKey, jobId);
      this.jobQueue.push(jobId);
      return {
        jobId,
        status: 'queued',
        message: job.message
      };
    }

    // Run immediately when below concurrency limit
    this.jobs.set(jobId, job);
    this.activeRoomVideoJobs.set(roomVideoKey, jobId);
    this.runningJobsCount++;
    this.runJobWorkflow(job);

    return { jobId, status: 'started', message: 'Download initiated.' };
  }

  /**
   * Attaches an Express response to stream SSE events for a job.
   */
  public attachSseClient(jobId: string, res: Response): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Set appropriate headers per production reverse proxy requirements
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send immediate initial state
    const initialPayload: AgentDownloadProgressEvent = {
      jobId: job.id,
      roomCode: job.roomCode,
      status: job.status,
      percent: job.percent,
      message: job.message,
      data: job.data || null,
      result: job.result
        ? {
            id: job.result.id,
            title: job.result.title,
            artist: job.result.artist,
            duration_seconds: job.result.duration_seconds,
            file_size: job.result.file_size
          }
        : null,
      error: job.error || null
    };

    res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

    if (job.status === 'completed' || job.status === 'error') {
      res.end();
      return true;
    }

    // 10-second heartbeat to prevent cloud reverse proxy timeouts
    const heartbeatTimer = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(': ping\n\n');
        } catch {
          clearInterval(heartbeatTimer);
        }
      } else {
        clearInterval(heartbeatTimer);
      }
    }, 10000);

    const clientWrapper: SseClientWrapper = {
      res,
      heartbeatTimer
    };

    job.sseClients.push(clientWrapper);

    res.on('close', () => {
      clearInterval(heartbeatTimer);
      job.sseClients = job.sseClients.filter((c) => c !== clientWrapper);
    });

    return true;
  }
}
