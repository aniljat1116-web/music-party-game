import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { Server } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { initDatabase } from '../src/db/database.js';
import { RoomRepo } from '../src/db/repositories/roomRepo.js';
import { PlayerRepo } from '../src/db/repositories/playerRepo.js';
import { SongRepo } from '../src/db/repositories/songRepo.js';
import { GameRepo } from '../src/db/repositories/gameRepo.js';
import { RoomService } from '../src/services/roomService.js';
import { SongService } from '../src/services/songService.js';
import { GameService } from '../src/services/gameService.js';
import { createApp } from '../src/app.js';
import { setupSocketHandlers } from '../src/socket/socketHandler.js';

describe('E2E Full-Stack Server & Socket Integration', () => {
  let server: http.Server;
  let ioServer: Server;
  let app: any;
  let port: number;
  let uploadsDir: string;
  let db: any;

  beforeAll(async () => {
    db = initDatabase(':memory:');
    uploadsDir = path.resolve(process.cwd(), 'test-e2e-uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const roomRepo = new RoomRepo(db);
    const playerRepo = new PlayerRepo(db);
    const songRepo = new SongRepo(db);
    const gameRepo = new GameRepo(db);

    const roomService = new RoomService(roomRepo, playerRepo);
    const songService = new SongService(songRepo, playerRepo, roomRepo, uploadsDir);
    const gameService = new GameService(roomRepo, playerRepo, songRepo, gameRepo);

    app = createApp(roomService, songService);
    server = http.createServer(app);
    ioServer = new Server(server, { cors: { origin: '*' } });
    setupSocketHandlers(ioServer, roomService, songService, gameService);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as any;
        port = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it('serves the frontend index.html on root path', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Who Added This Song?');
  });

  it('creates a room and joins via REST API', async () => {
    // 1. Create Room
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'HostDJ', discussionDuration: 30, totalRounds: 3 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const roomCode = createRes.body.room.code;
    const hostToken = createRes.body.sessionToken;

    // 2. Join Room
    const joinRes = await request(app)
      .post('/api/rooms/join')
      .send({ roomCode, nickname: 'Guest1' });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.success).toBe(true);
    const guestToken = joinRes.body.sessionToken;

    // 3. Upload song via multipart/form-data
    const dummyAudio = Buffer.from('RIFF....WAVEfmt ....data....');
    const uploadRes = await request(app)
      .post(`/api/rooms/${roomCode}/songs`)
      .set('Authorization', `Bearer ${hostToken}`)
      .attach('audio', dummyAudio, 'sample.mp3')
      .field('duration', '30');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    const songId = uploadRes.body.song.id;

    // 4. Stream song with session token
    const streamRes = await request(app)
      .get(`/api/rooms/${roomCode}/audio/${songId}?token=${hostToken}`)
      .set('Range', 'bytes=0-10');

    expect(streamRes.status).toBe(206);
    expect(streamRes.headers['content-range']).toBeDefined();

    // 5. Unauthorized stream attempt
    const badStreamRes = await request(app)
      .get(`/api/rooms/${roomCode}/audio/${songId}?token=invalid_token`);
    expect(badStreamRes.status).toBe(403);
  });

  it('connects via Socket.IO and performs room synchronization', async () => {
    // Create Room
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'SocketHost', discussionDuration: 30, totalRounds: 3 });
    const roomCode = createRes.body.room.code;
    const hostToken = createRes.body.sessionToken;

    // Connect Client Socket
    const client: ClientSocketType = ClientSocket(`http://localhost:${port}`, {
      transports: ['websocket']
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        client.emit('room:join', { sessionToken: hostToken, roomCode });
      });

      client.on('room:joined', (data) => {
        expect(data.room.code).toBe(roomCode);
        expect(data.player.nickname).toBe('SocketHost');
        client.disconnect();
        resolve();
      });

      client.on('error', (err) => reject(new Error(err.message)));
    });
  });
});
