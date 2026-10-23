import http from 'http';
import { Server } from 'socket.io';
import { CONFIG } from './config.js';
import { initDatabase } from './db/database.js';
import { RoomRepo } from './db/repositories/roomRepo.js';
import { PlayerRepo } from './db/repositories/playerRepo.js';
import { SongRepo } from './db/repositories/songRepo.js';
import { GameRepo } from './db/repositories/gameRepo.js';
import { RoomService } from './services/roomService.js';
import { SongService } from './services/songService.js';
import { GameService } from './services/gameService.js';
import { JamendoService } from './services/jamendoService.js';
import { YouTubeService } from './services/youtubeService.js';
import { MusicDownloadAgentService } from './services/musicDownloadAgentService.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { createApp } from './app.js';

export function startServer() {
  // Initialize Database
  const db = initDatabase();

  // Instantiate Repositories
  const roomRepo = new RoomRepo(db);
  const playerRepo = new PlayerRepo(db);
  const songRepo = new SongRepo(db);
  const gameRepo = new GameRepo(db);

  // Instantiate Services
  const roomService = new RoomService(roomRepo, playerRepo);
  const songService = new SongService(songRepo, playerRepo, roomRepo);
  const gameService = new GameService(roomRepo, playerRepo, songRepo, gameRepo);
  const jamendoService = new JamendoService();
  const youtubeService = new YouTubeService();
  const agentService = new MusicDownloadAgentService(songService);

  // Create Express App & HTTP Server
  const app = createApp(roomService, songService, jamendoService, youtubeService, agentService);
  const httpServer = http.createServer(app);

  // Create Socket.IO server
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Wire agent download completion to broadcast room:songs_updated to all room members
  agentService.setOnJobCompletedCallback((roomCode) => {
    const roomUpper = roomCode.toUpperCase();
    const sockets = io.sockets.adapter.rooms.get(roomUpper);
    if (sockets) {
      for (const socketId of sockets) {
        const sock = io.sockets.sockets.get(socketId) as any;
        if (sock && sock.playerId) {
          const songs = songService.getRoomSongs(roomUpper, sock.playerId);
          sock.emit('room:songs_updated', songs);
        }
      }
    }
  });

  // Setup Socket event listeners
  setupSocketHandlers(io, roomService, songService, gameService);

  httpServer.listen(CONFIG.PORT, () => {
    console.log(`🎵 Music Party Game server running at http://localhost:${CONFIG.PORT}`);
    console.log(`📁 Audio uploads stored at: ${CONFIG.UPLOADS_DIR}`);
    console.log(`💾 SQLite database at: ${CONFIG.DB_PATH}`);
  });

  // Safe startup diagnostic: Verify headless browser can launch for downloader agent
  agentService.verifyBrowserReadiness().then((status) => {
    if (status.available) {
      console.log(`🚀 [TuneGuessr] Music download agent is online and ready (${status.browserName}).`);
    } else {
      console.warn(`⚠️ [TuneGuessr] Music download agent is unavailable: ${status.error}`);
    }
  }).catch((err) => {
    console.warn(`⚠️ [TuneGuessr] Unexpected error during downloader browser check: ${err.message}`);
  });

  return { httpServer, io, db, roomService, songService, gameService, agentService };
}

// Auto-start when executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
