import Database from 'better-sqlite3';
import { Player, PublicPlayer } from '../../types/index.js';
import { getDatabase } from '../database.js';

export class PlayerRepo {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  createPlayer(
    id: string,
    roomCode: string,
    nickname: string,
    sessionToken: string,
    isHost = false
  ): Player {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO players (id, room_code, nickname, session_token, is_host, is_ready, score, connected, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?)
    `);
    stmt.run(id, roomCode.toUpperCase(), nickname.trim(), sessionToken, isHost ? 1 : 0, now);
    return this.getPlayerById(id)!;
  }

  getPlayerById(id: string): Player | null {
    const stmt = this.db.prepare(`SELECT * FROM players WHERE id = ?`);
    const p = stmt.get(id) as Player | undefined;
    return p || null;
  }

  getPlayerByToken(sessionToken: string): Player | null {
    const stmt = this.db.prepare(`SELECT * FROM players WHERE session_token = ?`);
    const p = stmt.get(sessionToken) as Player | undefined;
    return p || null;
  }

  getPlayersInRoom(roomCode: string): Player[] {
    const stmt = this.db.prepare(`SELECT * FROM players WHERE room_code = ? ORDER BY created_at ASC`);
    return stmt.all(roomCode.toUpperCase()) as Player[];
  }

  getPublicPlayersInRoom(roomCode: string): PublicPlayer[] {
    const players = this.getPlayersInRoom(roomCode);
    return players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      is_host: Boolean(p.is_host),
      is_ready: Boolean(p.is_ready),
      score: p.score,
      connected: Boolean(p.connected)
    }));
  }

  countPlayersInRoom(roomCode: string): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM players WHERE room_code = ?`);
    const res = stmt.get(roomCode.toUpperCase()) as { cnt: number };
    return res.cnt;
  }

  updatePlayerConnection(id: string, connected: boolean, socketId: string | null = null): void {
    const stmt = this.db.prepare(`UPDATE players SET connected = ?, socket_id = ? WHERE id = ?`);
    stmt.run(connected ? 1 : 0, socketId, id);
  }

  setPlayerReady(id: string, isReady: boolean): void {
    const stmt = this.db.prepare(`UPDATE players SET is_ready = ? WHERE id = ?`);
    stmt.run(isReady ? 1 : 0, id);
  }

  setAllPlayersUnready(roomCode: string): void {
    const stmt = this.db.prepare(`UPDATE players SET is_ready = 0 WHERE room_code = ?`);
    stmt.run(roomCode.toUpperCase());
  }

  resetScores(roomCode: string): void {
    const stmt = this.db.prepare(`UPDATE players SET score = 0 WHERE room_code = ?`);
    stmt.run(roomCode.toUpperCase());
  }

  updateScore(id: string, newScore: number): void {
    const stmt = this.db.prepare(`UPDATE players SET score = ? WHERE id = ?`);
    stmt.run(newScore, id);
  }

  incrementScore(id: string, points = 1): void {
    const stmt = this.db.prepare(`UPDATE players SET score = score + ? WHERE id = ?`);
    stmt.run(points, id);
  }

  transferHost(roomCode: string, newHostPlayerId: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE players SET is_host = 0 WHERE room_code = ?`).run(roomCode.toUpperCase());
      this.db.prepare(`UPDATE players SET is_host = 1 WHERE id = ?`).run(newHostPlayerId);
      this.db.prepare(`UPDATE rooms SET host_player_id = ? WHERE code = ?`).run(newHostPlayerId, roomCode.toUpperCase());
    });
    tx();
  }

  deletePlayer(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM players WHERE id = ?`);
    stmt.run(id);
  }
}
