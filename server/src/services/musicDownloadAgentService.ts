import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Response } from 'express';
import { CONFIG } from '../config.js';
import { SongService } from './songService.js';
import {
  extractYouTubeId,
  isValidYouTubeUrl,
  sanitizeFilename,
  formatFileSize,
  findBrowserExecutable,
  resolveBrowserExecutable,
  getSanitizedBrowserName,
  getMemoryStats,
  logMemory
} from './agentUtils.js';
import { AgentDownloadPhase, AgentDownloadProgressEvent, Song } from '../types/index.js';

const execFileAsync = promisify(execFile);
const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';

export interface BrowserStatus {
  checked: boolean;
  available: boolean;
  browserName: string;
  error: string | null;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';

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
    available: false,
    browserName: 'unknown',
    error: null
  };

  constructor(songService: SongService, tempDir: string = CONFIG.AGENT_TEMP_DIR) {
    this.songService = songService;
    this.tempDir = tempDir;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Initialize immediate synchronous check
    const syncPath = findBrowserExecutable();
    this.browserStatus = {
      checked: false,
      available: !!syncPath,
      browserName: getSanitizedBrowserName(syncPath),
      error: syncPath ? null : 'Browser not yet verified on this host'
    };
  }

  /**
   * Diagnostic startup check: Verifies browser executable exists without launching heavy Chromium at boot.
   * Chromium is launched strictly on-demand when a download job executes to conserve Render memory.
   */
  public async verifyBrowserReadiness(): Promise<BrowserStatus> {
    try {
      const execPath = (await resolveBrowserExecutable()) || findBrowserExecutable();
      if (!execPath) {
        const errorMsg = 'No compatible Chromium or Chrome browser was detected on this host.';
        console.warn(`⚠️ [MusicDownloadAgent] Diagnostic check: ${errorMsg} Downloader feature will be unavailable.`);
        this.browserStatus = {
          checked: true,
          available: false,
          browserName: 'none',
          error: errorMsg
        };
        return this.browserStatus;
      }

      const browserName = getSanitizedBrowserName(execPath);
      logMemory('Startup-BrowserCheck');
      console.log(`🚀 [MusicDownloadAgent] Browser binary detected and ready (${browserName}). Will launch on demand.`);
      this.browserStatus = {
        checked: true,
        available: true,
        browserName,
        error: null
      };
      return this.browserStatus;
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to verify browser executable.';
      console.warn(`⚠️ [MusicDownloadAgent] Browser check failed: ${errMsg}. Downloader feature will be unavailable.`);
      this.browserStatus = {
        checked: true,
        available: false,
        browserName: 'unknown',
        error: errMsg
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
      memory: getMemoryStats()
    };
  }

  public getBrowserStatus(): BrowserStatus {
    return { ...this.browserStatus };
  }

  public isBrowserAvailable(): boolean {
    if (!this.browserStatus.checked) {
      return !!findBrowserExecutable();
    }
    return this.browserStatus.available;
  }

  public setOnJobCompletedCallback(cb: (roomCode: string, song: Song) => void): void {
    this.onJobCompletedCallback = cb;
  }

  public getJob(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Downloads an audio stream using chunked HTTP Range requests with curl.exe,
   * falling back to a direct stream if chunking is unsupported.
   */
  private async downloadMediaFile(
    mediaUrl: string,
    totalBytes: number,
    targetPath: string,
    onProgress: (event: { phase: AgentDownloadPhase; percent: number; message: string }) => void,
    job: DownloadJob
  ): Promise<void> {
    const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks
    const numChunks = totalBytes && totalBytes > 0 ? Math.ceil(totalBytes / CHUNK_SIZE) : 1;

    // Prevent Server-Side Request Forgery (SSRF)
    const parsedUrl = new URL(mediaUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('Disallowed media stream protocol.');
    }

    if (totalBytes && totalBytes > 0 && numChunks > 1) {
      const tempParts: string[] = [];
      try {
        for (let i = 0; i < numChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min((i + 1) * CHUNK_SIZE - 1, totalBytes - 1);
          const partPath = `${targetPath}.part${i}`;
          tempParts.push(partPath);
          job.tempFiles.push(partPath);

          const pct = Math.round(50 + ((i + 1) / numChunks) * 40);
          onProgress({
            phase: 'downloading',
            percent: pct,
            message: `Downloading audio chunk ${i + 1}/${numChunks} (${formatFileSize(start)} - ${formatFileSize(end)})...`
          });

          await execFileAsync(
            curlBin,
            [
              '-4',
              '-L',
              '-s',
              '-r',
              `${start}-${end}`,
              '-H',
              `User-Agent: ${USER_AGENT}`,
              '-H',
              'Referer: https://youaudiodown.com/',
              mediaUrl,
              '-o',
              partPath
            ],
            { timeout: 45000 }
          );
        }

        onProgress({ phase: 'downloading', percent: 92, message: 'Assembling audio stream...' });

        const outStream = fs.createWriteStream(targetPath);
        for (const part of tempParts) {
          await new Promise<void>((resolvePart, rejectPart) => {
            const inStream = fs.createReadStream(part);
            inStream.pipe(outStream, { end: false });
            inStream.on('end', () => {
              try {
                fs.unlinkSync(part);
              } catch {}
              resolvePart();
            });
            inStream.on('error', (err) => {
              try {
                fs.unlinkSync(part);
              } catch {}
              rejectPart(err);
            });
          });
          job.tempFiles = job.tempFiles.filter((p) => p !== part);
        }
        outStream.end();

        await new Promise<void>((resolve, reject) => {
          outStream.on('finish', resolve);
          outStream.on('error', reject);
        });

        return;
      } catch (chunkErr: any) {
        tempParts.forEach((p) => {
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch {}
          }
        });
        console.warn('Chunked download encountered error, trying single-stream fallback:', chunkErr.message);
      }
    }

    // Single-stream fallback
    onProgress({ phase: 'downloading', percent: 70, message: 'Downloading audio stream directly...' });
    await execFileAsync(
      curlBin,
      [
        '-4',
        '-L',
        '-s',
        '-H',
        `User-Agent: ${USER_AGENT}`,
        '-H',
        'Referer: https://youaudiodown.com/',
        mediaUrl,
        '-o',
        targetPath
      ],
      { timeout: 90000 }
    );
  }

  /**
   * Dispatches an event to in-memory state and all SSE listeners.
   */
  private emitProgress(job: DownloadJob, event: { phase: AgentDownloadPhase; percent: number; message: string; data?: any }): void {
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
      result: job.result ? {
        id: job.result.id,
        title: job.result.title,
        artist: job.result.artist,
        duration_seconds: job.result.duration_seconds,
        file_size: job.result.file_size
      } : null,
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
   * Core browser automation workflow.
   */
  private async executeDownloadWorkflow(job: DownloadJob): Promise<Song> {
    const { videoId, url } = job;
    const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Check browser executable
    const browserPath = (await resolveBrowserExecutable()) || findBrowserExecutable();
    if (!browserPath) {
      throw new Error(
        'No compatible Chromium or Edge browser was detected on this host. Please ensure Microsoft Edge or Google Chrome is installed.'
      );
    }

    const browserName = getSanitizedBrowserName(browserPath);
    this.emitProgress(job, {
      phase: 'launching_browser',
      percent: 15,
      message: `Launching browser automation engine (${browserName})...`
    });

    let browser: Browser | null = null;
    const startTime = Date.now();
    let tempTargetFilePath: string | null = null;
    logMemory(`Job-${job.id}-Start`);

    try {
      browser = await puppeteer.launch({
        executablePath: browserPath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--mute-audio',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-zygote',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1024,768',
          '--js-flags=--max-old-space-size=128'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      // Capture API response from youaudiodown.com
      let apiData: any = null;
      let apiError: string | null = null;

      page.on('response', async (res) => {
        if (res.url().includes('/api/youtube/audio-video/audio/new') && res.request().method() === 'POST') {
          try {
            const json = await res.json();
            if (json.status === 'success' && json.data) {
              apiData = json.data;
            } else if (json.message || json.status === 'error') {
              apiError = json.message || 'API processing error';
            }
          } catch {}
        }
      });

      // 2. Navigate to https://youaudiodown.com/
      this.emitProgress(job, {
        phase: 'navigating',
        percent: 25,
        message: 'Connecting to conversion service...'
      });

      await page.goto('https://youaudiodown.com/', { waitUntil: 'networkidle2', timeout: 35000 });

      // 3. Input URL
      this.emitProgress(job, {
        phase: 'submitting_url',
        percent: 35,
        message: 'Submitting URL to conversion pipeline...'
      });

      await page.waitForSelector('#ymdUrlInput', { timeout: 15000 });
      await page.click('#ymdUrlInput', { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type('#ymdUrlInput', normalizedUrl, { delay: 20 });

      // 4. Click Submit
      this.emitProgress(job, {
        phase: 'submitting_url',
        percent: 40,
        message: 'Initiating Turnstile verification and stream extraction...'
      });

      const submitBtn = (await page.$('#xrespond-tools-turnstile')) || (await page.$('.ymd-fetch-btn'));
      if (!submitBtn) {
        throw new Error('Submit button not found on conversion service interface.');
      }
      await submitBtn.click();

      // 5. Wait for conversion to finish
      this.emitProgress(job, {
        phase: 'processing',
        percent: 45,
        message: 'Converting audio stream (handling verification)...'
      });

      const maxWaitTime = 40000;
      const pollInterval = 500;
      let elapsed = 0;
      let previewReady = false;

      while (elapsed < maxWaitTime) {
        const status = await page.evaluate(() => {
          const preview = document.getElementById('ymdAudioPreview');
          const err = document.getElementById('ymdErrorMessage');
          const isPreviewVisible = preview && window.getComputedStyle(preview).display !== 'none';
          const hasError =
            err && window.getComputedStyle(err).display !== 'none' && (err.textContent || '').trim().length > 0;
          const errorText = hasError ? (err?.textContent || '').trim() : null;

          return { isPreviewVisible, hasError, errorText };
        });

        if (status.hasError || apiError) {
          throw new Error(`Website conversion failed: ${status.errorText || apiError}`);
        }

        if (status.isPreviewVisible || apiData) {
          previewReady = true;
          break;
        }

        await new Promise((r) => setTimeout(r, pollInterval));
        elapsed += pollInterval;

        const waitPct = Math.min(48, Math.round(45 + (elapsed / maxWaitTime) * 5));
        this.emitProgress(job, {
          phase: 'processing',
          percent: waitPct,
          message: `Converting audio on service... (${Math.round(elapsed / 1000)}s)`
        });
      }

      if (!previewReady && !apiData) {
        throw new Error('Conversion timed out. The external service did not complete processing in time.');
      }

      // 6. Extract metadata
      this.emitProgress(job, {
        phase: 'processing',
        percent: 50,
        message: 'Conversion completed. Extracting media stream info...'
      });

      const domInfo = await page.evaluate(() => {
        const title = document.getElementById('ymdAudioTitle')?.textContent?.trim() || '';
        const duration = document.getElementById('ymdAudioDuration')?.textContent?.trim() || '';
        const uploader = document.getElementById('ymdAudioUploader')?.textContent?.trim() || '';
        const thumb = document.getElementById('ymdThumbnailPreview')?.getAttribute('src') || '';
        return { title, duration, uploader, thumb };
      });

      const title = (apiData?.title || domInfo.title || `YouTube Track ${videoId}`).trim();
      const rawDuration = apiData?.duration || domInfo.duration || '';
      const uploader = (apiData?.uploader || domInfo.uploader || 'YouTube').trim();
      const thumbnail = apiData?.thumbnail || domInfo.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      // Determine download URL and total size
      let mediaUrl = apiData?.audio_url || apiData?.download_url || (apiData?.versions && apiData.versions[0]?.url);
      let ext = 'm4a';
      let totalSizeBytes = 0;

      if (apiData?.versions && apiData.versions.length > 0) {
        const best = apiData.versions[0];
        mediaUrl = best.url || mediaUrl;
        ext = best.ext || 'm4a';
        totalSizeBytes = best.size_bytes || 0;
      }

      if (!mediaUrl) {
        await page.evaluate(() => {
          (window as any).__interceptedUrl = null;
          window.open = function (url: string) {
            (window as any).__interceptedUrl = url;
            return { focus: () => {} } as any;
          };
        });

        const dlBtn = (await page.$('#ymdDownloadBtn')) || (await page.$('button[data-ymd-download]'));
        if (dlBtn) await dlBtn.click();

        await page.waitForFunction(() => (window as any).__interceptedUrl !== null, { timeout: 8000 }).catch(() => {});
        mediaUrl = await page.evaluate(() => (window as any).__interceptedUrl);
      }

      if (!mediaUrl) {
        throw new Error('Unable to extract audio download URL from the page.');
      }

      if (!totalSizeBytes) {
        const clenMatch = mediaUrl.match(/[?&]clen=(\d+)/);
        if (clenMatch) {
          totalSizeBytes = parseInt(clenMatch[1], 10);
        }
      }

      // Check configured max file size before full download if size is known
      if (totalSizeBytes > CONFIG.MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Audio stream size (${formatFileSize(totalSizeBytes)}) exceeds maximum allowed size of ${formatFileSize(CONFIG.MAX_FILE_SIZE_BYTES)}.`
        );
      }

      // 7. Download audio to isolated temporary location
      const tempSafeFilename = `temp_${job.id}_${Date.now()}.${ext}`;
      tempTargetFilePath = path.join(this.tempDir, tempSafeFilename);
      job.tempFiles.push(tempTargetFilePath);

      this.emitProgress(job, {
        phase: 'downloading',
        percent: 55,
        message: `Downloading audio stream (${formatFileSize(totalSizeBytes)})...`,
        data: { title, uploader, rawDuration, thumbnail, ext }
      });

      await this.downloadMediaFile(mediaUrl, totalSizeBytes, tempTargetFilePath, (ev) => this.emitProgress(job, ev), job);

      // 8. Disk and integrity verification
      this.emitProgress(job, {
        phase: 'verifying',
        percent: 95,
        message: 'Verifying downloaded audio file integrity...'
      });

      if (!fs.existsSync(tempTargetFilePath)) {
        throw new Error('Download verification failed: Audio file was not created on disk.');
      }

      const stat = fs.statSync(tempTargetFilePath);
      if (stat.size === 0) {
        throw new Error('Download verification failed: Audio file is empty (0 bytes).');
      }

      if (stat.size > CONFIG.MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Downloaded file size (${formatFileSize(stat.size)}) exceeds maximum limit of ${formatFileSize(CONFIG.MAX_FILE_SIZE_BYTES)}.`
        );
      }

      // Parse duration to seconds
      let durationSeconds = 30;
      if (typeof rawDuration === 'number' && rawDuration > 0) {
        durationSeconds = Math.round(rawDuration);
      } else if (typeof rawDuration === 'string' && rawDuration.trim()) {
        const parts = rawDuration.trim().split(':').map((p) => parseInt(p, 10));
        if (parts.every((p) => !isNaN(p))) {
          if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
          else if (parts.length === 1) durationSeconds = parts[0];
        }
      }
      durationSeconds = Math.max(5, Math.min(600, durationSeconds));

      // 9. Hand over to SongService for validation and permanent storage in room queue
      const savedSong = this.songService.addAgentDownloadedSong(job.sessionToken, {
        sourceFilePath: tempTargetFilePath,
        fileSizeBytes: stat.size,
        mimeType: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
        title,
        artist: uploader,
        durationSeconds,
        videoId,
        thumbnailUrl: thumbnail,
        ext
      });

      job.result = savedSong;
      job.tempFiles = job.tempFiles.filter((p) => p !== tempTargetFilePath);

      // Notify callback (e.g. Socket.IO broadcast)
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
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }

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
      if (existingJob && (existingJob.status !== 'completed' && existingJob.status !== 'error')) {
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
      result: job.result ? {
        id: job.result.id,
        title: job.result.title,
        artist: job.result.artist,
        duration_seconds: job.result.duration_seconds,
        file_size: job.result.file_size
      } : null,
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
