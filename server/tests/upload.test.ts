import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';
import path from 'path';
import fs from 'fs';

describe('Song Upload & Storage Validation', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-upload-dir');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('validates supported file extensions and MIME types', () => {
    const { room, sessionToken } = ctx.roomService.createRoom('Host', 30, 5);
    const validBuffer = Buffer.from('fake mp3 audio data');

    // Valid upload
    const song = ctx.songService.saveSongFile(
      sessionToken,
      validBuffer,
      'cool_song.mp3',
      'audio/mpeg',
      35
    );
    expect(song.id).toBeDefined();
    expect(song.original_filename).toBe('cool_song.mp3');

    // Invalid extension
    expect(() => {
      ctx.songService.saveSongFile(
        sessionToken,
        validBuffer,
        'malicious.exe',
        'application/octet-stream',
        30
      );
    }).toThrow(/Invalid file format/);

    // Invalid MIME type
    expect(() => {
      ctx.songService.saveSongFile(
        sessionToken,
        validBuffer,
        'fake.mp3',
        'application/x-executable',
        30
      );
    }).toThrow(/Invalid audio MIME type/);
  });

  it('enforces 20MB file size limit', () => {
    const { sessionToken } = ctx.roomService.createRoom('Host', 30, 5);
    const oversizedBuffer = Buffer.alloc(21 * 1024 * 1024); // 21 MB

    expect(() => {
      ctx.songService.saveSongFile(
        sessionToken,
        oversizedBuffer,
        'huge_song.mp3',
        'audio/mpeg',
        60
      );
    }).toThrow(/File is too large/);
  });

  it('prevents path traversal and generates safe unique stored filenames', () => {
    const { sessionToken } = ctx.roomService.createRoom('Host', 30, 5);
    const validBuffer = Buffer.from('audio bytes');

    const song = ctx.songService.saveSongFile(
      sessionToken,
      validBuffer,
      '../../etc/passwd.mp3',
      'audio/mpeg',
      30
    );

    // Stored filename must be a uuid-based filename inside uploadsDir
    expect(song.stored_filename).toMatch(/^[0-9a-f-]+\.mp3$/);
    const diskPath = path.join(ctx.uploadsDir, song.stored_filename);
    expect(fs.existsSync(diskPath)).toBe(true);
  });

  it('enforces maximum 3 songs per player', () => {
    const { sessionToken } = ctx.roomService.createRoom('Host', 30, 5);
    const validBuffer = Buffer.from('audio');

    // Upload 3 songs successfully
    for (let i = 1; i <= 3; i++) {
      ctx.songService.saveSongFile(
        sessionToken,
        validBuffer,
        `song_${i}.mp3`,
        'audio/mpeg',
        30
      );
    }

    // 4th song should be rejected
    expect(() => {
      ctx.songService.saveSongFile(
        sessionToken,
        validBuffer,
        'song_4.mp3',
        'audio/mpeg',
        30
      );
    }).toThrow(/maximum of 3 songs/);
  });

  it('rejects streaming songs for non-members of the room', () => {
    const room1 = ctx.roomService.createRoom('Host1', 30, 5);
    const room2 = ctx.roomService.createRoom('Host2', 30, 5);

    const song = ctx.songService.saveSongFile(
      room1.sessionToken,
      Buffer.from('mp3'),
      'room1_song.mp3',
      'audio/mpeg',
      30
    );

    // Host 2 attempting to access Host 1's song
    expect(() => {
      ctx.songService.getSongFilePathForPlayback(
        room2.sessionToken,
        room1.room.code,
        song.id
      );
    }).toThrow(/Access denied/);
  });
});
