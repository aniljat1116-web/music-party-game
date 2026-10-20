import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestContext } from './setup.js';
import { JamendoService } from '../src/services/jamendoService.js';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';
import type { Request, Response, NextFunction } from 'express';

describe('Jamendo Music Search & Manual Upload Integration', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-jamendo-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  describe('JamendoService', () => {
    it('reports not configured when client ID is missing or empty', async () => {
      const jamendo = new JamendoService('');
      expect(jamendo.isConfigured()).toBe(false);

      const res = await jamendo.searchTracks('acoustic');
      expect(res.success).toBe(false);
      expect(res.isConfigured).toBe(false);
      expect(res.error).toMatch(/Jamendo Client ID is not configured/i);
    });

    it('returns empty result for blank or whitespace query without calling API', async () => {
      const jamendo = new JamendoService('valid_client_id');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await jamendo.searchTracks('   ');
      expect(res.success).toBe(true);
      expect(res.tracks).toEqual([]);
      expect(res.total_count).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('successfully parses Jamendo API search response with valid fields', async () => {
      const jamendo = new JamendoService('test_client_id');

      const mockJamendoResponse = {
        headers: {
          status: 'success',
          code: 0,
          error_message: '',
          warnings: '',
          results_count: 2
        },
        results: [
          {
            id: '1001',
            name: 'Summer Breeze',
            duration: 185,
            artist_id: '501',
            artist_name: 'Chill Beats',
            album_name: 'Summer Vibes',
            album_image: 'https://usercontent.jamendo.com?artwork=1001',
            audio: 'https://prod-1.storage.jamendo.com/?trackid=1001',
            audiodownload_allowed: true,
            license_ccurl: 'http://creativecommons.org/licenses/by-nc-sa/3.0/'
          },
          {
            id: '1002',
            name: 'Night Drive',
            duration: 210,
            artist_id: '502',
            artist_name: 'Synthwave Duo',
            album_name: 'Neon Horizon',
            album_image: null,
            audio: 'https://prod-1.storage.jamendo.com/?trackid=1002',
            audiodownload_allowed: true
          }
        ]
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockJamendoResponse
      } as any);

      const res = await jamendo.searchTracks('summer', 10, 0);

      expect(res.success).toBe(true);
      expect(res.tracks.length).toBe(2);

      const track1 = res.tracks[0];
      expect(track1.id).toBe('1001');
      expect(track1.title).toBe('Summer Breeze');
      expect(track1.artist).toBe('Chill Beats');
      expect(track1.duration).toBe(185);
      expect(track1.artwork_url).toBe('https://usercontent.jamendo.com?artwork=1001');
      expect(track1.audio_url).toBe('https://prod-1.storage.jamendo.com/?trackid=1001');
      expect(track1.playable).toBe(true);

      const track2 = res.tracks[1];
      expect(track2.id).toBe('1002');
      expect(track2.artwork_url).toBeNull();
      expect(track2.playable).toBe(true);
    });

    it('handles Jamendo invalid client id error (code 5)', async () => {
      const jamendo = new JamendoService('bad_client_id');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          headers: {
            status: 'failed',
            code: 5,
            error_message: 'Jamendo Api Invalid Client Id Error: Your credential is not authorized.',
            results_count: 0
          },
          results: []
        })
      } as any);

      const res = await jamendo.searchTracks('rock');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Invalid Jamendo Client ID/i);
    });

    it('handles Jamendo rate limit exceeded error (code 6)', async () => {
      const jamendo = new JamendoService('valid_client_id');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          headers: {
            status: 'failed',
            code: 6,
            error_message: 'Rate Limit Exceeded',
            results_count: 0
          },
          results: []
        })
      } as any);

      const res = await jamendo.searchTracks('chill');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/rate limit exceeded/i);
    });

    it('handles network failure gracefully', async () => {
      const jamendo = new JamendoService('valid_client_id');

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      const res = await jamendo.searchTracks('ambient');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Connection refused/i);
    });
  });

  describe('Adding Songs (Jamendo & Manual Upload)', () => {
    it('successfully adds a Jamendo track to a room', () => {
      const { room, sessionToken } = ctx.roomService.createRoom('Host', 300, 3);

      const song = ctx.songService.addJamendoSong(sessionToken, {
        trackId: 'jamendo_999',
        title: 'Sunset Highway',
        artist: 'The Roadsters',
        duration: 190,
        audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=jamendo_999',
        artworkUrl: 'https://usercontent.jamendo.com/cover999.jpg'
      });

      expect(song).toBeDefined();
      expect(song.source_type).toBe('jamendo');
      expect(song.external_id).toBe('jamendo_999');
      expect(song.title).toBe('Sunset Highway');
      expect(song.artist).toBe('The Roadsters');
      expect(song.artwork_url).toBe('https://usercontent.jamendo.com/cover999.jpg');
      expect(song.duration_seconds).toBe(190);
      expect(song.file_size).toBe(0);

      // Verify song appears in room songs
      const roomSongs = ctx.songService.getRoomSongs(room.code);
      expect(roomSongs.length).toBe(1);
      expect(roomSongs[0].source_type).toBe('jamendo');
      expect(roomSongs[0].artwork_url).toBe('https://usercontent.jamendo.com/cover999.jpg');
    });

    it('prevents adding the same Jamendo track twice to the same room', () => {
      const { room, sessionToken } = ctx.roomService.createRoom('Host', 300, 3);
      const p2 = ctx.roomService.joinRoom(room.code, 'Player2');

      ctx.songService.addJamendoSong(sessionToken, {
        trackId: 'duplicate_track_1',
        title: 'Original Submission',
        artist: 'Artist A',
        duration: 150,
        audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=duplicate_track_1'
      });

      // Player 2 tries to add the exact same Jamendo track
      expect(() => {
        ctx.songService.addJamendoSong(p2.sessionToken, {
          trackId: 'duplicate_track_1',
          title: 'Duplicate Submission',
          artist: 'Artist A',
          duration: 150,
          audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=duplicate_track_1'
        });
      }).toThrow(/already been added to the room/i);
    });

    it('enforces maximum 3 songs per player limit across mixed sources', () => {
      const { sessionToken } = ctx.roomService.createRoom('Host', 300, 3);

      // 1. Add manual upload
      ctx.songService.saveSongFile(sessionToken, Buffer.from('mp3'), 'track1.mp3', 'audio/mpeg', 30);

      // 2. Add Jamendo track
      ctx.songService.addJamendoSong(sessionToken, {
        trackId: 'j1',
        title: 'Jamendo 1',
        artist: 'Artist 1',
        duration: 120,
        audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=j1'
      });

      // 3. Add second Jamendo track (now 3 songs)
      ctx.songService.addJamendoSong(sessionToken, {
        trackId: 'j2',
        title: 'Jamendo 2',
        artist: 'Artist 2',
        duration: 120,
        audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=j2'
      });

      // 4. Attempting 4th song (upload) must fail
      expect(() => {
        ctx.songService.saveSongFile(sessionToken, Buffer.from('mp3'), 'track4.mp3', 'audio/mpeg', 30);
      }).toThrow(/maximum of 3 songs/i);

      // Attempting 4th song (Jamendo) must also fail
      expect(() => {
        ctx.songService.addJamendoSong(sessionToken, {
          trackId: 'j3',
          title: 'Jamendo 3',
          artist: 'Artist 3',
          duration: 120,
          audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=j3'
        });
      }).toThrow(/maximum of 3 songs/i);
    });

    it('validates audio upload file size and formats properly', () => {
      const { sessionToken } = ctx.roomService.createRoom('Host', 300, 3);

      // Invalid extension
      expect(() => {
        ctx.songService.saveSongFile(sessionToken, Buffer.from('exe'), 'virus.exe', 'application/octet-stream', 30);
      }).toThrow(/Invalid file format/i);

      // Oversized file (>20MB)
      const bigBuffer = Buffer.alloc(21 * 1024 * 1024);
      expect(() => {
        ctx.songService.saveSongFile(sessionToken, bigBuffer, 'giant.mp3', 'audio/mpeg', 30);
      }).toThrow(/File is too large/i);
    });
  });

  describe('Playback Routing & Multiplayer Game Flow', () => {
    it('routes playback to external URL for Jamendo and local file for manual upload', () => {
      const { room, sessionToken } = ctx.roomService.createRoom('Host', 300, 3);

      const uploaded = ctx.songService.saveSongFile(sessionToken, Buffer.from('mp3'), 'local.mp3', 'audio/mpeg', 30);
      const jamendo = ctx.songService.addJamendoSong(sessionToken, {
        trackId: 'j_stream_1',
        title: 'Jamendo Stream',
        artist: 'Streamer',
        duration: 180,
        audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=j_stream_1'
      });

      // Check upload playback info
      const uploadInfo = ctx.songService.getSongForPlayback(sessionToken, room.code, uploaded.id);
      expect(uploadInfo.isExternal).toBe(false);
      expect(uploadInfo.filePath).toBeDefined();

      // Check Jamendo playback info
      const jamendoInfo = ctx.songService.getSongForPlayback(sessionToken, room.code, jamendo.id);
      expect(jamendoInfo.isExternal).toBe(true);
      expect(jamendoInfo.externalUrl).toBe('https://prod-1.storage.jamendo.com/?trackid=j_stream_1');
    });

    it('plays a mixed multiplayer game (Jamendo + local uploads) with secret hiding and reveal', () => {
      const { room, sessionToken: hostToken, host } = ctx.roomService.createRoom('Host', 300, 3);
      const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
      const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

      // Host adds a Jamendo track
      const jamendoSong = ctx.songService.addJamendoSong(hostToken, {
        trackId: 'j_game_1',
        title: 'Electric Groove',
        artist: 'Funk Masters',
        duration: 160,
        audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=j_game_1',
        artworkUrl: 'https://usercontent.jamendo.com/cover_funk.jpg'
      });

      // Player 2 & 3 upload local tracks
      ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'p2.mp3', 'audio/mpeg', 30);
      ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'p3.mp3', 'audio/mpeg', 30);

      // Start game
      ctx.gameService.startGame(hostToken);
      const round = ctx.gameRepo.getCurrentRound(room.code)!;

      // Force round to use the Jamendo track
      ctx.db.prepare('UPDATE rounds SET song_id = ? WHERE id = ?').run(jamendoSong.id, round.id);

      // In playing phase: check Player 2 state (secret uploader must be hidden)
      const p2PlayingState = ctx.gameService.getGameStateForPlayer(p2.sessionToken);
      expect(p2PlayingState?.current_song?.uploader_id).toBeUndefined();
      expect(p2PlayingState?.current_song?.uploader_nickname).toBeUndefined();

      // Advance through discussion to voting
      ctx.gameService.transitionToDiscussion(room.code, round.id);
      ctx.gameService.transitionToVoting(room.code, round.id);

      // Player 2 votes for Host
      ctx.gameService.submitVote(p2.sessionToken, round.id, host.id);
      // Player 3 skips vote
      ctx.gameService.skipVote(p3.sessionToken, round.id);

      // Round automatically reveals!
      const current = ctx.gameRepo.getRoundById(round.id)!;
      expect(current.phase).toBe('revealed');

      // In revealed phase: check state exposes title, artist, uploader, and artwork
      const revealedState = ctx.gameService.getGameStateForPlayer(p2.sessionToken);
      expect(revealedState?.round_result).not.toBeNull();
      expect(revealedState?.round_result?.song_title).toBe('Electric Groove');
      expect(revealedState?.round_result?.artist).toBe('Funk Masters');
      expect(revealedState?.round_result?.uploader_nickname).toBe('Host');
      expect(revealedState?.round_result?.artwork_url).toBe('https://usercontent.jamendo.com/cover_funk.jpg');
    });
  });

  describe('Rate Limiter Middleware', () => {
    it('allows requests within limit and returns 429 when exceeded', () => {
      const limiter = createRateLimiter({
        windowMs: 10_000,
        max: 3,
        message: 'Rate limit exceeded'
      });

      const nextSpy = vi.fn();
      const mockReq = {
        headers: { authorization: 'Bearer test_token' },
        ip: '127.0.0.1',
        socket: {}
      } as unknown as Request;

      let statusCode = 200;
      let jsonResponse: any = null;
      const mockRes = {
        setHeader: vi.fn(),
        status: (code: number) => {
          statusCode = code;
          return mockRes;
        },
        json: (data: any) => {
          jsonResponse = data;
          return mockRes;
        }
      } as unknown as Response;

      // First 3 requests should pass
      limiter(mockReq, mockRes, nextSpy);
      limiter(mockReq, mockRes, nextSpy);
      limiter(mockReq, mockRes, nextSpy);
      expect(nextSpy).toHaveBeenCalledTimes(3);

      // 4th request exceeds max: 3
      limiter(mockReq, mockRes, nextSpy);
      expect(nextSpy).toHaveBeenCalledTimes(3); // Not called again
      expect(statusCode).toBe(429);
      expect(jsonResponse.error).toBe('Rate limit exceeded');
    });
  });
});
