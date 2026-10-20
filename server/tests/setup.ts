import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initDatabase } from '../src/db/database.js';
import { RoomRepo } from '../src/db/repositories/roomRepo.js';
import { PlayerRepo } from '../src/db/repositories/playerRepo.js';
import { SongRepo } from '../src/db/repositories/songRepo.js';
import { GameRepo } from '../src/db/repositories/gameRepo.js';
import { RoomService } from '../src/services/roomService.js';
import { SongService } from '../src/services/songService.js';
import { GameService } from '../src/services/gameService.js';

export function createTestContext(testDirName = 'test-uploads') {
  const db = initDatabase(':memory:');
  const uploadsDir = path.resolve(process.cwd(), testDirName);

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const roomRepo = new RoomRepo(db);
  const playerRepo = new PlayerRepo(db);
  const songRepo = new SongRepo(db);
  const gameRepo = new GameRepo(db);

  const roomService = new RoomService(roomRepo, playerRepo);
  const songService = new SongService(songRepo, playerRepo, roomRepo, uploadsDir);
  const gameService = new GameService(roomRepo, playerRepo, songRepo, gameRepo);

  const cleanup = () => {
    db.close();
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  };

  return {
    db,
    uploadsDir,
    roomRepo,
    playerRepo,
    songRepo,
    gameRepo,
    roomService,
    songService,
    gameService,
    cleanup
  };
}
