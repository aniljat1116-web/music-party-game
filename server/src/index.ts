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

  // Create Express App & HTTP Server
  const app = createApp(roomService, songService, jamendoService, youtubeService);
  const httpServer = http.createServer(app);

  // Create Socket.IO server
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Setup Socket event listeners
  setupSocketHandlers(io, roomService, songService, gameService);

  httpServer.listen(CONFIG.PORT, () => {
    console.log(`🎵 Music Party Game server running at http://localhost:${CONFIG.PORT}`);
    console.log(`📁 Audio uploads stored at: ${CONFIG.UPLOADS_DIR}`);
    console.log(`💾 SQLite database at: ${CONFIG.DB_PATH}`);
  });

  return { httpServer, io, db, roomService, songService, gameService };
}

// Auto-start when executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
