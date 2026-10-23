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
import { MusicDownloadAgentService } from '../src/services/musicDownloadAgentService.js';
import {
  findBrowserExecutable,
  resolveBrowserExecutable,
  getSanitizedBrowserName
} from '../src/services/agentUtils.js';

describe('Render Browser Discovery and Startup Diagnostics', () => {
  const testUploadsDir = path.resolve(process.cwd(), 'test-diag-uploads');
  const testTempDir = path.resolve(process.cwd(), 'test-diag-temp');
  let db: any;
  let roomService: RoomService;
  let songService: SongService;
  let agentService: MusicDownloadAgentService;
  let app: any;

  beforeEach(() => {
    if (!fs.existsSync(testUploadsDir)) fs.mkdirSync(testUploadsDir, { recursive: true });
    if (!fs.existsSync(testTempDir)) fs.mkdirSync(testTempDir, { recursive: true });

    db = initDatabase(':memory:');
    const roomRepo = new RoomRepo(db);
    const playerRepo = new PlayerRepo(db);
    const songRepo = new SongRepo(db);
    const gameRepo = new GameRepo(db);

    roomService = new RoomService(roomRepo, playerRepo);
    songService = new SongService(songRepo, playerRepo, roomRepo, testUploadsDir);
    agentService = new MusicDownloadAgentService(songService, testTempDir);
    app = createApp(roomService, songService, undefined, undefined, agentService);
  });

  afterEach(() => {
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

  describe('Browser Discovery & Path Detection', () => {
    it('successfully detects a valid browser executable on the current host', () => {
      const execPath = findBrowserExecutable();
      expect(execPath).not.toBeNull();
      if (execPath) {
        expect(fs.existsSync(execPath)).toBe(true);
      }
    });

    it('asynchronously resolves browser executable via resolveBrowserExecutable()', async () => {
      const execPath = await resolveBrowserExecutable();
      expect(execPath).not.toBeNull();
      if (execPath) {
        expect(fs.existsSync(execPath)).toBe(true);
      }
    });

    it('respects PUPPETEER_EXECUTABLE_PATH override if pointing to an existing binary', () => {
      const originalEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
      try {
        const detected = findBrowserExecutable();
        if (detected) {
          process.env.PUPPETEER_EXECUTABLE_PATH = detected;
          const overridden = findBrowserExecutable();
          expect(overridden).toBe(detected);
        }
      } finally {
        if (originalEnv !== undefined) {
          process.env.PUPPETEER_EXECUTABLE_PATH = originalEnv;
        } else {
          delete process.env.PUPPETEER_EXECUTABLE_PATH;
        }
      }
    });

    it('sanitizes browser names without exposing sensitive filesystem paths', () => {
      expect(getSanitizedBrowserName('/usr/bin/google-chrome')).toBe('Google Chrome');
      expect(getSanitizedBrowserName('C:\\Program Files\\Microsoft\\Edge\\msedge.exe')).toBe('Microsoft Edge');
      expect(getSanitizedBrowserName('/usr/bin/chromium')).toBe('Chromium');
      expect(getSanitizedBrowserName('/opt/render/.cache/puppeteer/chrome/linux/chrome')).toBe('Google Chrome');
      expect(getSanitizedBrowserName(null)).toBe('unknown');
    });
  });

  describe('Startup Diagnostic Verification & Health Endpoint', () => {
    it('verifies that browser can actually launch in headless mode', async () => {
      const status = await agentService.verifyBrowserReadiness();
      expect(status.checked).toBe(true);
      expect(status.available).toBe(true);
      expect(status.error).toBeNull();
      expect(typeof status.browserName).toBe('string');
    });

    it('exposes downloader diagnostic status on GET /api/health', async () => {
      await agentService.verifyBrowserReadiness();

      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.downloader).toBeDefined();
      expect(res.body.downloader.available).toBe(true);
      expect(res.body.downloader.checked).toBe(true);
      // Ensure private full paths are NOT leaked in public health output
      expect(res.body.downloader.browserPath).toBeUndefined();
    });
  });

  describe('Graceful Degradation When Browser Is Unavailable', () => {
    it('reports 503 Service Unavailable on agent-download when browser is disabled', async () => {
      // Simulate unavailable browser state
      (agentService as any).browserStatus = {
        checked: true,
        available: false,
        browserName: 'none',
        error: 'No compatible Chromium or Chrome browser was detected on this host.'
      };

      const { room, sessionToken } = roomService.createRoom('Host', 30, 5);

      const res = await request(app)
        .post(`/api/rooms/${room.code}/songs/agent-download`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/temporarily unavailable/i);
    });

    it('ensures core app routes (room creation, health) continue working even if browser fails', async () => {
      (agentService as any).browserStatus = {
        checked: true,
        available: false,
        browserName: 'none',
        error: 'Browser launch failed'
      };

      const healthRes = await request(app).get('/api/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.downloader.available).toBe(false);

      const roomRes = await request(app)
        .post('/api/rooms')
        .send({ nickname: 'Host' });
      expect(roomRes.status).toBe(201);
      expect(roomRes.body.room.code).toBeDefined();
    });
  });
});
