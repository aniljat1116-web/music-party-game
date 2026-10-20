import Database from 'better-sqlite3';
import { Room, RoomStatus, GameMode } from '../../types/index.js';
import { getDatabase } from '../database.js';

export class RoomRepo {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  createRoom(
    code: string,
    hostPlayerId: string,
    totalRounds = 5,
    discussionDuration = 30,
    gameMode: GameMode = 'who_added',
    clipDuration = 30
  ): Room {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO rooms (code, host_player_id, status, current_round, total_rounds, discussion_duration, game_mode, clip_duration, created_at, updated_at)
      VALUES (?, ?, 'lobby', 0, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(code, hostPlayerId, totalRounds, discussionDuration, gameMode, clipDuration, now, now);
    return this.getRoomByCode(code)!;
  }

  getRoomByCode(code: string): Room | null {
    const stmt = this.db.prepare(`SELECT * FROM rooms WHERE code = ?`);
    const room = stmt.get(code.toUpperCase()) as Room | undefined;
    return room || null;
  }

  updateRoomStatus(code: string, status: RoomStatus): void {
    const now = Date.now();
    const stmt = this.db.prepare(`UPDATE rooms SET status = ?, updated_at = ? WHERE code = ?`);
    stmt.run(status, now, code);
  }

  updateRoomRound(code: string, currentRound: number): void {
    const now = Date.now();
    const stmt = this.db.prepare(`UPDATE rooms SET current_round = ?, updated_at = ? WHERE code = ?`);
    stmt.run(currentRound, now, code);
  }

  updateRoomSettings(
    code: string,
    totalRounds: number,
    discussionDuration: number,
    gameMode?: GameMode,
    clipDuration?: number
  ): void {
    const now = Date.now();
    const current = this.getRoomByCode(code);
    const finalMode = gameMode || current?.game_mode || 'who_added';
    const finalClip = clipDuration || current?.clip_duration || 30;

    const stmt = this.db.prepare(`
      UPDATE rooms 
      SET total_rounds = ?, discussion_duration = ?, game_mode = ?, clip_duration = ?, updated_at = ? 
      WHERE code = ?
    `);
    stmt.run(totalRounds, discussionDuration, finalMode, finalClip, now, code);
  }

  resetRoomToLobby(code: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE rooms 
      SET status = 'lobby', current_round = 0, updated_at = ? 
      WHERE code = ?
    `);
    stmt.run(now, code);
  }

  deleteRoom(code: string): void {
    const stmt = this.db.prepare(`DELETE FROM rooms WHERE code = ?`);
    stmt.run(code);
  }
}
