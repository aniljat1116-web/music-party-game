import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

let dbInstance: Database.Database | null = null;

export function initDatabase(dbPath: string = CONFIG.DB_PATH): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      host_player_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby',
      current_round INTEGER NOT NULL DEFAULT 0,
      total_rounds INTEGER NOT NULL DEFAULT 5,
      discussion_duration INTEGER NOT NULL DEFAULT 300,
      game_mode TEXT NOT NULL DEFAULT 'who_added',
      clip_duration INTEGER NOT NULL DEFAULT 30,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      is_host INTEGER NOT NULL DEFAULT 0,
      is_ready INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      connected INTEGER NOT NULL DEFAULT 1,
      socket_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      uploader_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      duration_seconds REAL NOT NULL DEFAULT 30,
      title TEXT,
      artist TEXT,
      source_type TEXT NOT NULL DEFAULT 'upload',
      external_id TEXT,
      external_url TEXT,
      artwork_url TEXT,
      played_in_round INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      song_id TEXT NOT NULL REFERENCES songs(id),
      phase TEXT NOT NULL DEFAULT 'playing',
      playback_start_time INTEGER,
      phase_ends_at INTEGER,
      is_scored INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      voter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      voted_player_id TEXT,
      guess_title TEXT,
      guess_artist TEXT,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER NOT NULL DEFAULT 0,
      is_skipped INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE (round_id, voter_player_id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_code);
    CREATE INDEX IF NOT EXISTS idx_players_token ON players(session_token);
    CREATE INDEX IF NOT EXISTS idx_songs_room ON songs(room_code);
    CREATE INDEX IF NOT EXISTS idx_songs_uploader ON songs(uploader_player_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_room ON rounds(room_code);
    CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(round_id);
    CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_code);
  `);

  // Safe migrations for existing SQLite databases
  const runMigration = (sql: string) => {
    try {
      db.exec(sql);
    } catch (err: any) {
      if (!err.message?.includes('duplicate column name')) {
        console.warn('Migration note:', err.message);
      }
    }
  };

  runMigration(`ALTER TABLE rooms ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'who_added'`);
  runMigration(`ALTER TABLE rooms ADD COLUMN clip_duration INTEGER NOT NULL DEFAULT 30`);
  runMigration(`ALTER TABLE songs ADD COLUMN title TEXT`);
  runMigration(`ALTER TABLE songs ADD COLUMN artist TEXT`);
  runMigration(`ALTER TABLE songs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'upload'`);
  runMigration(`ALTER TABLE songs ADD COLUMN external_id TEXT`);
  runMigration(`ALTER TABLE songs ADD COLUMN external_url TEXT`);
  runMigration(`ALTER TABLE songs ADD COLUMN artwork_url TEXT`);
  runMigration(`ALTER TABLE votes ADD COLUMN guess_title TEXT`);
  runMigration(`ALTER TABLE votes ADD COLUMN guess_artist TEXT`);
  runMigration(`ALTER TABLE votes ADD COLUMN points_awarded INTEGER NOT NULL DEFAULT 0`);
  runMigration(`ALTER TABLE votes ADD COLUMN is_skipped INTEGER NOT NULL DEFAULT 0`);

  dbInstance = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
