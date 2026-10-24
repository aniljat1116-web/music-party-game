import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { RoomRepo } from '../src/db/repositories/roomRepo.js';
import { PlayerRepo } from '../src/db/repositories/playerRepo.js';
import { SongRepo } from '../src/db/repositories/songRepo.js';
import { GameRepo } from '../src/db/repositories/gameRepo.js';
import { RoomService } from '../src/services/roomService.js';
import { SongService } from '../src/services/songService.js';
import { GameService } from '../src/services/gameService.js';
import { YouTubeService, YouTubeSearchResult } from '../src/services/youtubeService.js';
import { initDatabase } from '../src/db/database.js';
import Database from 'better-sqlite3';

// Mock YouTubeService for deterministic offline test verification
class MockYouTubeService extends YouTubeService {
  override async search(query: string, maxResults = 5): Promise<YouTubeSearchResult[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      throw new Error('Search query cannot be empty.');
    }
    if (trimmed.length > 200) {
      throw new Error('Search query is too long (maximum 200 characters).');
    }
    if (trimmed === 'NO_RESULTS_FOUND') {
      return [];
    }
    if (trimmed === 'SIMULATE_SEARCH_ERROR') {
      throw new Error('Failed to retrieve search results from YouTube. Please try another query.');
    }
    if (trimmed.includes('youtube.com/watch?v=dQw4w9WgXcQ') || trimmed.includes('youtu.be/dQw4w9WgXcQ')) {
      return [
        {
          videoId: 'dQw4w9WgXcQ',
          title: 'Direct Link Video - Rick Astley',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          duration: '3:33'
        }
      ];
    }

    // Return mock results matching query
    const mockList: YouTubeSearchResult[] = [
      {
        videoId: 'dQw4w9WgXcQ',
        title: `${trimmed} - Official Song 1`,
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        duration: '3:33'
      },
      {
        videoId: '9bZkp7q19f0',
        title: `${trimmed} - Remastered Track 2`,
        thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
        duration: '4:15'
      },
      {
        videoId: 'kJQP7kiw5Fk',
        title: `${trimmed} - Live Concert 3`,
        thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
        duration: '5:02'
      },
      {
        videoId: 'fJ9rUzIMcZQ',
        title: `${trimmed} - Acoustic 4`,
        thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
        duration: '3:45'
      },
      {
        videoId: 'L_LUpnjgPso',
        title: `${trimmed} - Club Mix 5`,
        thumbnail: 'https://i.ytimg.com/vi/L_LUpnjgPso/hqdefault.jpg',
        duration: '6:10'
      },
      {
        videoId: 'extra666',
        title: 'Extra Track 6 (Should Be Truncated)',
        thumbnail: 'https://i.ytimg.com/vi/extra/hqdefault.jpg',
        duration: '2:20'
      }
    ];

    return mockList.slice(0, maxResults);
  }
}

describe('YouTube Search & Song Queueing Integration', () => {
  let db: Database.Database;
  let roomRepo: RoomRepo;
  let playerRepo: PlayerRepo;
  let songRepo: SongRepo;
  let gameRepo: GameRepo;
  let roomService: RoomService;
  let songService: SongService;
  let gameService: GameService;
  let mockYouTubeService: MockYouTubeService;
  let app: any;

  beforeEach(() => {
    db = initDatabase(':memory:');
    roomRepo = new RoomRepo(db);
    playerRepo = new PlayerRepo(db);
    songRepo = new SongRepo(db);
    gameRepo = new GameRepo(db);

    roomService = new RoomService(roomRepo, playerRepo);
    songService = new SongService(songRepo, playerRepo, roomRepo);
    gameService = new GameService(roomRepo, playerRepo, songRepo, gameRepo);
    mockYouTubeService = new MockYouTubeService();

    app = createApp(roomService, songService, undefined, mockYouTubeService);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Server-Side Song Search (POST /api/search)', () => {
    it('returns up to 5 results with videoId, title, thumbnail, and duration for valid query', async () => {
      const res = await request(app)
        .post('/api/search')
        .send({ query: 'Daft Punk' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBe(5);

      const first = res.body.results[0];
      expect(first).toHaveProperty('videoId');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('thumbnail');
      expect(first).toHaveProperty('duration');
      expect(first.videoId).toBe('dQw4w9WgXcQ');
      expect(first.title).toContain('Daft Punk');
      expect(first.thumbnail).toContain('https://');
      expect(first.duration).toBe('3:33');
    });

    it('rejects empty query with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/search')
        .send({ query: '   ' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('cannot be empty');
    });

    it('rejects missing query object with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/search')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Search query is required');
    });

    it('rejects excessively long query (>200 chars) with HTTP 400', async () => {
      const longQuery = 'A'.repeat(201);
      const res = await request(app)
        .post('/api/search')
        .send({ query: longQuery })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('too long');
    });

    it('returns direct video result when given a full YouTube URL', async () => {
      const res = await request(app)
        .post('/api/search')
        .send({ query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].videoId).toBe('dQw4w9WgXcQ');
      expect(res.body.results[0].title).toBe('Direct Link Video - Rick Astley');
    });

    it('handles empty results gracefully without errors', async () => {
      const res = await request(app)
        .post('/api/search')
        .send({ query: 'NO_RESULTS_FOUND' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.results).toEqual([]);
    });

    it('handles search provider errors safely without exposing secrets', async () => {
      const res = await request(app)
        .post('/api/search')
        .send({ query: 'SIMULATE_SEARCH_ERROR' })
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Failed to retrieve search results from YouTube. Please try another query.');
      expect(res.body.stack).toBeUndefined();
    });
  });

  describe('2. Queueing YouTube Songs (POST /api/rooms/:roomCode/songs/youtube)', () => {
    it('successfully adds YouTube song to the room queue', async () => {
      const { room, host } = roomService.createRoom('HostPlayer');

      const res = await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${host.session_token}`)
        .send({
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          duration: '3:33',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.song.title).toBe('Never Gonna Give You Up');
      expect(res.body.song.source_type).toBe('youtube');
      expect(res.body.song.duration_seconds).toBe(213); // 3*60 + 33

      // Verify song exists in room
      const roomSongs = songService.getRoomSongs(room.code);
      expect(roomSongs.length).toBe(1);
      expect(roomSongs[0].source_type).toBe('youtube');
      expect(roomSongs[0].title).toBe('Never Gonna Give You Up');
    });

    it('prevents adding duplicate YouTube videos in the same room', async () => {
      const { room, host } = roomService.createRoom('HostPlayer');

      // Add once
      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${host.session_token}`)
        .send({
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          duration: '3:33'
        })
        .expect(201);

      // Add same video ID again
      const res = await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${host.session_token}`)
        .send({
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up (Duplicate)',
          duration: '3:33'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already been added');
    });

    it('rejects adding YouTube song without session token', async () => {
      const { room } = roomService.createRoom('HostPlayer');

      const res = await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .send({
          videoId: 'dQw4w9WgXcQ',
          title: 'Track'
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('rejects adding song if room has already started', async () => {
      const { room, host } = roomService.createRoom('HostPlayer');
      const p2 = roomService.joinRoom(room.code, 'Player2').player;
      const p3 = roomService.joinRoom(room.code, 'Player3').player;

      // Add songs to satisfy requirement
      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${host.session_token}`)
        .send({ videoId: 'v1', title: 'Song 1', duration: '1:00' });

      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${p2.session_token}`)
        .send({ videoId: 'v2', title: 'Song 2', duration: '1:00' });

      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${p3.session_token}`)
        .send({ videoId: 'v3', title: 'Song 3', duration: '1:00' });

      // Update room to 3 rounds to match the 3 uploaded tracks (discussionDuration: 300s)
      roomService.updateRoomSettings(host.session_token, 3, 300);

      // Start game
      gameService.startGame(host.session_token);

      // Attempt to add song while game is playing
      const res = await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${host.session_token}`)
        .send({ videoId: 'v4', title: 'Song 4', duration: '1:00' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Cannot add songs once the game has started');
    });

    it('provides external_id (videoId) during round playback for YouTube player', async () => {
      const { room, host } = roomService.createRoom('HostPlayer');
      const p2 = roomService.joinRoom(room.code, 'Player2').player;
      const p3 = roomService.joinRoom(room.code, 'Player3').player;

      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${host.session_token}`)
        .send({ videoId: 'ytVideo123', title: 'Epic YouTube Track', duration: '30' });

      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${p2.session_token}`)
        .send({ videoId: 'ytVideo456', title: 'Another Track', duration: '30' });

      await request(app)
        .post(`/api/rooms/${room.code}/songs/youtube`)
        .set('Authorization', `Bearer ${p3.session_token}`)
        .send({ videoId: 'ytVideo789', title: 'Third Track', duration: '30' });

      // Update room to 3 rounds to match the 3 uploaded tracks (discussionDuration: 300s)
      roomService.updateRoomSettings(host.session_token, 3, 300);

      gameService.startGame(host.session_token);
      const state = gameService.getGameStateForPlayer(host.session_token, room.code);
      expect(state.phase).toBe('playing');
      expect(state.current_song).toBeDefined();
      expect(state.current_song?.source_type).toBe('youtube');
      expect(['ytVideo123', 'ytVideo456', 'ytVideo789']).toContain(state.current_song?.external_id);
    });
  });

  describe('3. YouTubeService Unit Tests', () => {
    it('validates query constraints and handles empty or excessively long input', async () => {
      const realService = new YouTubeService();
      await expect(realService.search('')).rejects.toThrow('cannot be empty');
      await expect(realService.search('   ')).rejects.toThrow('cannot be empty');
      await expect(realService.search('a'.repeat(201))).rejects.toThrow('too long');
    });
  });
});
