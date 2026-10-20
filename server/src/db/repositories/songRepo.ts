import Database from 'better-sqlite3';
import { Song, PublicSong } from '../../types/index.js';
import { getDatabase } from '../database.js';

export class SongRepo {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  createSong(
    id: string,
    roomCode: string,
    uploaderPlayerId: string,
    originalFilename: string,
    storedFilename: string,
    fileSize: number,
    mimeType: string,
    durationSeconds = 30,
    title?: string | null,
    artist?: string | null,
    sourceType: 'upload' | 'jamendo' | 'youtube' = 'upload',
    externalId?: string | null,
    externalUrl?: string | null,
    artworkUrl?: string | null
  ): Song {
    const now = Date.now();
    const cleanTitle = title?.trim() || null;
    const cleanArtist = artist?.trim() || null;

    const stmt = this.db.prepare(`
      INSERT INTO songs (
        id, room_code, uploader_player_id, original_filename, stored_filename,
        file_size, mime_type, duration_seconds, title, artist,
        source_type, external_id, external_url, artwork_url, played_in_round, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);
    stmt.run(
      id,
      roomCode.toUpperCase(),
      uploaderPlayerId,
      originalFilename,
      storedFilename,
      fileSize,
      mimeType,
      durationSeconds,
      cleanTitle,
      cleanArtist,
      sourceType,
      externalId || null,
      externalUrl || null,
      artworkUrl || null,
      now
    );
    return this.getSongById(id)!;
  }

  hasExternalSongInRoom(roomCode: string, externalId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM songs
      WHERE room_code = ? AND external_id = ?
    `);
    const res = stmt.get(roomCode.toUpperCase(), String(externalId)) as { cnt: number };
    return res.cnt > 0;
  }

  getSongById(id: string): Song | null {
    const stmt = this.db.prepare(`SELECT * FROM songs WHERE id = ?`);
    const s = stmt.get(id) as Song | undefined;
    return s || null;
  }

  getSongsInRoom(roomCode: string): Song[] {
    const stmt = this.db.prepare(`SELECT * FROM songs WHERE room_code = ? ORDER BY created_at ASC`);
    return stmt.all(roomCode.toUpperCase()) as Song[];
  }

  getSongsByUploader(uploaderPlayerId: string): Song[] {
    const stmt = this.db.prepare(`SELECT * FROM songs WHERE uploader_player_id = ? ORDER BY created_at ASC`);
    return stmt.all(uploaderPlayerId) as Song[];
  }

  getPublicSongsInRoom(roomCode: string): PublicSong[] {
    const stmt = this.db.prepare(`
      SELECT s.id, s.original_filename, s.file_size, s.uploader_player_id, s.title, s.artist,
             s.source_type, s.external_id, s.artwork_url, s.duration_seconds, p.nickname as uploader_nickname
      FROM songs s
      LEFT JOIN players p ON s.uploader_player_id = p.id
      WHERE s.room_code = ?
      ORDER BY s.created_at ASC
    `);
    return stmt.all(roomCode.toUpperCase()) as PublicSong[];
  }

  getUnplayedSongsInRoom(roomCode: string): Song[] {
    const stmt = this.db.prepare(`
      SELECT * FROM songs 
      WHERE room_code = ? AND played_in_round IS NULL
    `);
    return stmt.all(roomCode.toUpperCase()) as Song[];
  }

  markSongPlayed(id: string, roundNumber: number): void {
    const stmt = this.db.prepare(`UPDATE songs SET played_in_round = ? WHERE id = ?`);
    stmt.run(roundNumber, id);
  }

  resetSongsPlayedStatus(roomCode: string): void {
    const stmt = this.db.prepare(`UPDATE songs SET played_in_round = NULL WHERE room_code = ?`);
    stmt.run(roomCode.toUpperCase());
  }

  deleteSong(id: string): Song | null {
    const song = this.getSongById(id);
    if (!song) return null;
    const stmt = this.db.prepare(`DELETE FROM songs WHERE id = ?`);
    stmt.run(id);
    return song;
  }
}
