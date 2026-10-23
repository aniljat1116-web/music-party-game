import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import {
  extractYouTubeId,
  isValidYouTubeUrl,
  sanitizeFilename,
  formatFileSize,
  findBrowserExecutable
} from '../src/services/agentUtils.js';

describe('MusicDownloadAgent Integration Tests', () => {
  const testUploadsDir = path.resolve(process.cwd(), 'test-agent-uploads');
  const testTempDir = path.resolve(process.cwd(), 'test-agent-temp');
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

  describe('1. URL Validation & Parsing', () => {
    it('parses standard watch URLs', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(extractYouTubeId(url)).toBe('dQw4w9WgXcQ');
      expect(isValidYouTubeUrl(url)).toBe(true);
    });

    it('parses short youtu.be URLs', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(extractYouTubeId(url)).toBe('dQw4w9WgXcQ');
      expect(isValidYouTubeUrl(url)).toBe(true);
    });

    it('parses YouTube Shorts URLs', () => {
      const url = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
      expect(extractYouTubeId(url)).toBe('dQw4w9WgXcQ');
      expect(isValidYouTubeUrl(url)).toBe(true);
    });

    it('accepts raw 11-char Video IDs', () => {
      const id = 'dQw4w9WgXcQ';
      expect(extractYouTubeId(id)).toBe('dQw4w9WgXcQ');
      expect(isValidYouTubeUrl(id)).toBe(true);
    });

    it('rejects invalid or non-YouTube URLs', () => {
      expect(isValidYouTubeUrl('https://example.com/not-youtube')).toBe(false);
      expect(isValidYouTubeUrl('')).toBe(false);
      expect(isValidYouTubeUrl(null)).toBe(false);
      expect(isValidYouTubeUrl(undefined)).toBe(false);
      expect(isValidYouTubeUrl('12345')).toBe(false);
    });
  });

  describe('2. Sanitization & Utility Functions', () => {
    it('sanitizes illegal Windows characters in filename', () => {
      const raw = 'Artist: Title / "Track" * ? < > |';
      const sanitized = sanitizeFilename(raw, 'm4a');
      expect(sanitized).not.toMatch(/[<>:"/\\|?*]/);
      expect(sanitized.endsWith('.m4a')).toBe(true);
    });

    it('formats file sizes accurately', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(3449447)).toBe('3.29 MB');
    });

    it('locates a valid Chromium or Edge executable on the host system', () => {
      const execPath = findBrowserExecutable();
      expect(execPath).not.toBeNull();
      if (execPath) {
        expect(fs.existsSync(execPath)).toBe(true);
      }
    });
  });

  describe('3. Audio Validation & Storage (SongService.addAgentDownloadedSong)', () => {
    it('validates and safely persists a downloaded audio file', () => {
      const { room, sessionToken } = roomService.createRoom('Player1', 30, 5);

      // Create a simulated downloaded audio file in temp dir
      const tempFile = path.join(testTempDir, 'downloaded_track.m4a');
      fs.writeFileSync(tempFile, Buffer.from('simulated-m4a-audio-content'));

      const song = songService.addAgentDownloadedSong(sessionToken, {
        sourceFilePath: tempFile,
        fileSizeBytes: 27,
        mimeType: 'audio/mp4',
        title: 'Rick Astley - Never Gonna Give You Up',
        artist: 'Rick Astley',
        durationSeconds: 213,
        videoId: 'dQw4w9WgXcQ',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        ext: 'm4a'
      });

      expect(song).toBeDefined();
      expect(song.source_type).toBe('agent_download');
      expect(song.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(song.artist).toBe('Rick Astley');
      expect(song.external_id).toBe('dQw4w9WgXcQ');
      expect(song.duration_seconds).toBe(213);

      // Verify file was copied to uploads dir with safe UUID filename
      const storedFilePath = path.join(testUploadsDir, song.stored_filename);
      expect(fs.existsSync(storedFilePath)).toBe(true);
      expect(song.stored_filename).toMatch(/^[0-9a-f-]{36}\.m4a$/i);

      // Verify playback route provides local file streaming
      const playbackInfo = songService.getSongForPlayback(sessionToken, room.code, song.id);
      expect(playbackInfo.isExternal).toBe(false);
      expect(playbackInfo.filePath).toBe(storedFilePath);

      // Verify deletion removes stored file from disk
      songService.deleteSong(sessionToken, song.id);
      expect(fs.existsSync(storedFilePath)).toBe(false);
      expect(songRepo.getSongById(song.id)).toBeNull();
    });

    it('rejects empty (0 byte) downloaded files', () => {
      const { sessionToken } = roomService.createRoom('Player1', 30, 5);
      const emptyFile = path.join(testTempDir, 'empty.m4a');
      fs.writeFileSync(emptyFile, Buffer.alloc(0));

      expect(() => {
        songService.addAgentDownloadedSong(sessionToken, {
          sourceFilePath: emptyFile,
          fileSizeBytes: 0,
          mimeType: 'audio/mp4',
          title: 'Empty Track',
          durationSeconds: 30,
          videoId: 'dQw4w9WgXcQ',
          ext: 'm4a'
        });
      }).toThrow(/empty/i);
    });

    it('rejects oversized downloaded files (> 20 MB)', () => {
      const { sessionToken } = roomService.createRoom('Player1', 30, 5);
      const oversizedFile = path.join(testTempDir, 'oversized.m4a');
      // Create sparse 21MB file
      const fd = fs.openSync(oversizedFile, 'w');
      fs.writeSync(fd, Buffer.from('x'), 0, 1, 21 * 1024 * 1024);
      fs.closeSync(fd);

      expect(() => {
        songService.addAgentDownloadedSong(sessionToken, {
          sourceFilePath: oversizedFile,
          fileSizeBytes: 21 * 1024 * 1024 + 1,
          mimeType: 'audio/mp4',
          title: 'Oversized Track',
          durationSeconds: 120,
          videoId: 'dQw4w9WgXcQ',
          ext: 'm4a'
        });
      }).toThrow(/too large/i);
    });

    it('rejects unsupported file extensions', () => {
      const { sessionToken } = roomService.createRoom('Player1', 30, 5);
      const exeFile = path.join(testTempDir, 'malicious.exe');
      fs.writeFileSync(exeFile, Buffer.from('MZ...'));

      expect(() => {
        songService.addAgentDownloadedSong(sessionToken, {
          sourceFilePath: exeFile,
          fileSizeBytes: 100,
          mimeType: 'application/octet-stream',
          title: 'Malicious',
          durationSeconds: 30,
          videoId: 'dQw4w9WgXcQ',
          ext: 'exe'
        });
      }).toThrow(/Invalid file format/i);
    });
  });

  describe('4. Multiplayer Rules: Duplicates & Song Limits', () => {
    it('prevents duplicate additions of the same YouTube video in a room', () => {
      const { sessionToken } = roomService.createRoom('Player1', 30, 5);
      const temp1 = path.join(testTempDir, 'track1.m4a');
      fs.writeFileSync(temp1, Buffer.from('audio 1'));

      songService.addAgentDownloadedSong(sessionToken, {
        sourceFilePath: temp1,
        fileSizeBytes: 7,
        mimeType: 'audio/mp4',
        title: 'Song 1',
        durationSeconds: 30,
        videoId: 'dQw4w9WgXcQ',
        ext: 'm4a'
      });

      const temp2 = path.join(testTempDir, 'track2.m4a');
      fs.writeFileSync(temp2, Buffer.from('audio 2'));

      expect(() => {
        songService.addAgentDownloadedSong(sessionToken, {
          sourceFilePath: temp2,
          fileSizeBytes: 7,
          mimeType: 'audio/mp4',
          title: 'Song 1 Duplicate',
          durationSeconds: 30,
          videoId: 'dQw4w9WgXcQ',
          ext: 'm4a'
        });
      }).toThrow(/already been added/i);
    });

    it('enforces maximum 3 songs per player', () => {
      const { sessionToken } = roomService.createRoom('Player1', 30, 5);

      for (let i = 1; i <= 3; i++) {
        const temp = path.join(testTempDir, `track_${i}.m4a`);
        fs.writeFileSync(temp, Buffer.from(`audio ${i}`));
        songService.addAgentDownloadedSong(sessionToken, {
          sourceFilePath: temp,
          fileSizeBytes: 7,
          mimeType: 'audio/mp4',
          title: `Song ${i}`,
          durationSeconds: 30,
          videoId: `vid_${i}_1234567`,
          ext: 'm4a'
        });
      }

      const temp4 = path.join(testTempDir, 'track_4.m4a');
      fs.writeFileSync(temp4, Buffer.from('audio 4'));

      expect(() => {
        songService.addAgentDownloadedSong(sessionToken, {
          sourceFilePath: temp4,
          fileSizeBytes: 7,
          mimeType: 'audio/mp4',
          title: 'Song 4',
          durationSeconds: 30,
          videoId: 'vid_4_1234567',
          ext: 'm4a'
        });
      }).toThrow(/maximum of 3 songs/i);
    });
  });

  describe('5. Express HTTP Endpoints', () => {
    it('POST /:roomCode/songs/agent-download rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/rooms/TESTROOM/songs/agent-download')
        .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('POST /:roomCode/songs/agent-download rejects requests from non-members', async () => {
      const { sessionToken } = roomService.createRoom('Host', 30, 5);

      const res = await request(app)
        .post('/api/rooms/OTHERROOM/songs/agent-download')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('POST /:roomCode/songs/agent-download rejects invalid YouTube URLs', async () => {
      const { room, sessionToken } = roomService.createRoom('Host', 30, 5);

      const res = await request(app)
        .post(`/api/rooms/${room.code}/songs/agent-download`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ url: 'not-a-youtube-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid YouTube/i);
    });

    it('POST /:roomCode/songs/agent-download initiates job and deduplicates active requests', async () => {
      const { room, sessionToken } = roomService.createRoom('Host', 30, 5);
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      const res1 = await request(app)
        .post(`/api/rooms/${room.code}/songs/agent-download`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ url });

      expect(res1.status).toBe(202);
      expect(res1.body.success).toBe(true);
      expect(res1.body.jobId).toBeDefined();
      expect(res1.body.status).toBe('started');

      const jobId = res1.body.jobId;

      // Duplicate request for same video in same room
      const res2 = await request(app)
        .post(`/api/rooms/${room.code}/songs/agent-download`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ url });

      expect(res2.status).toBe(202);
      expect(res2.body.jobId).toBe(jobId);
      expect(res2.body.status).toBe('already_running');

      // Check status endpoint
      const statusRes = await request(app).get(`/api/rooms/${room.code}/songs/agent-download/${jobId}/status`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.jobId).toBe(jobId);
      expect(statusRes.body.roomCode).toBe(room.code);
    });
  });
});
