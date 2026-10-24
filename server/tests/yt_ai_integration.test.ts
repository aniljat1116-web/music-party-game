import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';
import { RoomRepo } from '../src/db/repositories/roomRepo.js';
import { PlayerRepo } from '../src/db/repositories/playerRepo.js';
import { SongRepo } from '../src/db/repositories/songRepo.js';
import { GameRepo } from '../src/db/repositories/gameRepo.js';
import { RoomService } from '../src/services/roomService.js';
import { SongService } from '../src/services/songService.js';
import { GameService } from '../src/services/gameService.js';
import { MusicDownloadAgentService } from '../src/services/musicDownloadAgentService.js';
import { CONFIG } from '../src/config.js';

describe('YT-Ai Audio Converter Integration Tests', () => {
  const testUploadsDir = path.resolve(process.cwd(), 'test-ytai-uploads');
  const testTempDir = path.resolve(process.cwd(), 'test-ytai-temp');
  let db: any;
  let roomRepo: RoomRepo;
  let playerRepo: PlayerRepo;
  let songRepo: SongRepo;
  let gameRepo: GameRepo;
  let roomService: RoomService;
  let songService: SongService;
  let gameService: GameService;
  let agentService: MusicDownloadAgentService;
  let app: any;

  beforeEach(() => {
    if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });
    if (!fs.existsSync(testTempDir)) fs.mkdirSync(testTempDir, { recursive: true });

    db = initDatabase(':memory:');
    roomRepo = new RoomRepo(db);
    playerRepo = new PlayerRepo(db);
    songRepo = new SongRepo(db);
    gameRepo = new GameRepo(db);

    roomService = new RoomService(roomRepo, playerRepo);
    songService = new SongService(songRepo, playerRepo, roomRepo, testUploadsDir);
    gameService = new GameService(roomRepo, playerRepo, songRepo, gameRepo);
    agentService = new MusicDownloadAgentService(songService, testTempDir);

    app = createApp(roomService, songService, undefined, undefined, agentService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      db.close();
    } catch {}

    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  it('successfully converts YouTube video via mocked YT-Ai endpoints and persists MP3 track', async () => {
    const { room, sessionToken } = roomService.createRoom('Host', 30, 5);
    const mockAudioBytes = Buffer.from('mock-mp3-audio-data-from-ytai');

    // Mock globalThis.fetch to simulate YT-Ai endpoints
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/x/a')) {
        return new Response(JSON.stringify({ job_id: 'mock_job_123', status: 'processing' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (urlStr.includes('/x/b')) {
        return new Response(
          JSON.stringify({
            status: 'completed',
            filename: 'Queen - Bohemian Rhapsody.mp3',
            download_url: 'https://tools.ruvs.in/x/c?job_id=mock_job_123'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/x/c') || urlStr.includes('/stream')) {
        return new Response(mockAudioBytes, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(mockAudioBytes.length)
          }
        });
      }
      if (urlStr.includes('/info')) {
        return new Response(JSON.stringify({ title: 'Bohemian Rhapsody', duration: 354 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(url, init);
    });

    const postRes = await request(app)
      .post(`/api/rooms/${room.code}/songs/agent-download`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ' });

    expect(postRes.status).toBe(202);
    expect(postRes.body.jobId).toBeDefined();

    const jobId = postRes.body.jobId;

    // Wait for the background job to finish
    let job: any;
    for (let i = 0; i < 40; i++) {
      job = agentService.getJob(jobId);
      if (job && (job.status === 'completed' || job.status === 'error')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(job).toBeDefined();
    expect(job.status).toBe('completed');
    expect(job.result).toBeDefined();
    expect(job.result.title).toBe('Bohemian Rhapsody');
    expect(job.result.duration_seconds).toBe(354);
    expect(job.result.source_type).toBe('agent_download');

    // Verify stored file on disk
    const storedFile = path.join(testUploadsDir, job.result.stored_filename);
    expect(fs.existsSync(storedFile)).toBe(true);
    expect(fs.readFileSync(storedFile)).toEqual(mockAudioBytes);

    // Verify audio streaming route works with range headers
    const audioRes = await request(app)
      .get(`/api/rooms/${room.code}/audio/${job.result.id}?token=${sessionToken}`)
      .set('Range', 'bytes=0-10');

    expect(audioRes.status).toBe(206);
    expect(audioRes.headers['content-range']).toMatch(/^bytes 0-10\//);
    expect(audioRes.headers['content-type']).toBe('audio/mpeg');
  });

  it('handles stream failure from YT-Ai service with informative error message and cleans temp files', async () => {
    const { room, sessionToken } = roomService.createRoom('Host', 30, 5);

    // Mock globalThis.fetch to return a 502 Bad Gateway
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/info')) {
        return new Response(JSON.stringify({ title: 'Failing Video', duration: 120 }), { status: 200 });
      }
      if (urlStr.includes('/x/a') || urlStr.includes('/stream')) {
        return new Response('YT-Ai internal transcoding error', { status: 502 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const postRes = await request(app)
      .post(`/api/rooms/${room.code}/songs/agent-download`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    expect(postRes.status).toBe(202);
    const jobId = postRes.body.jobId;

    let job: any;
    for (let i = 0; i < 40; i++) {
      job = agentService.getJob(jobId);
      if (job && (job.status === 'completed' || job.status === 'error')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(job).toBeDefined();
    expect(job.status).toBe('error');
    expect(job.error).toMatch(/HTTP 502/i);

    // Temp directory should have no orphaned files
    const tempFiles = fs.readdirSync(testTempDir);
    expect(tempFiles.length).toBe(0);
  });
});
