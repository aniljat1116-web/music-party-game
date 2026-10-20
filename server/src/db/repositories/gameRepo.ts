import Database from 'better-sqlite3';
import { Round, Vote, GamePhase, PublicVoteResult, ChatMessage, FinalRanking } from '../../types/index.js';
import { getDatabase } from '../database.js';

export function normalizeAnswer(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/['"`.,!?:;()\-–—_/\\#@&]/g, '')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkGuessMatch(guess: string | null | undefined, actual: string | null | undefined): boolean {
  const normGuess = normalizeAnswer(guess);
  const normActual = normalizeAnswer(actual);
  if (!normGuess || !normActual) return false;
  if (normGuess === normActual) return true;

  // Substring match if sufficiently distinctive (>= 4 chars)
  if (normGuess.length >= 4 && normActual.includes(normGuess)) return true;
  if (normActual.length >= 4 && normGuess.includes(normActual)) return true;

  return false;
}

export class GameRepo {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  createRound(
    id: string,
    roomCode: string,
    roundNumber: number,
    songId: string,
    phase: GamePhase,
    playbackStartTime: number | null,
    phaseEndsAt: number | null
  ): Round {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO rounds (id, room_code, round_number, song_id, phase, playback_start_time, phase_ends_at, is_scored, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    stmt.run(id, roomCode.toUpperCase(), roundNumber, songId, phase, playbackStartTime, phaseEndsAt, now);
    return this.getRoundById(id)!;
  }

  getRoundById(id: string): Round | null {
    const stmt = this.db.prepare(`SELECT * FROM rounds WHERE id = ?`);
    const r = stmt.get(id) as Round | undefined;
    return r || null;
  }

  getCurrentRound(roomCode: string): Round | null {
    const stmt = this.db.prepare(`
      SELECT * FROM rounds 
      WHERE room_code = ? 
      ORDER BY round_number DESC 
      LIMIT 1
    `);
    const r = stmt.get(roomCode.toUpperCase()) as Round | undefined;
    return r || null;
  }

  updateRoundPhase(roundId: string, phase: GamePhase, phaseEndsAt: number | null): void {
    const stmt = this.db.prepare(`
      UPDATE rounds 
      SET phase = ?, phase_ends_at = ? 
      WHERE id = ?
    `);
    stmt.run(phase, phaseEndsAt, roundId);
  }

  /**
   * Records a vote in "Who Added This Song?" mode.
   */
  recordVote(
    id: string,
    roomCode: string,
    roundId: string,
    voterPlayerId: string,
    votedPlayerId: string,
    correctUploaderId: string
  ): { success: boolean; error?: string; vote?: Vote } {
    const isCorrect = votedPlayerId === correctUploaderId ? 1 : 0;
    const pointsAwarded = isCorrect ? 1 : 0;
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO votes (id, room_code, round_id, voter_player_id, voted_player_id, guess_title, guess_artist, points_awarded, is_correct, is_skipped, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, 0, ?)
      `);
      stmt.run(id, roomCode.toUpperCase(), roundId, voterPlayerId, votedPlayerId, pointsAwarded, isCorrect, now);

      const vote = this.db.prepare(`SELECT * FROM votes WHERE id = ?`).get(id) as Vote;
      return { success: true, vote };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'You have already voted in this round.' };
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * Records a guess in "Guess the Song" mode.
   * Scoring Rule:
   *  +2 points for correct song title
   *  +1 point for correct artist (bonus)
   */
  recordGuess(
    id: string,
    roomCode: string,
    roundId: string,
    voterPlayerId: string,
    guessTitle: string,
    guessArtist: string | undefined,
    actualTitle: string,
    actualArtist: string | undefined | null
  ): { success: boolean; error?: string; vote?: Vote; pointsEarned?: number } {
    const titleMatch = checkGuessMatch(guessTitle, actualTitle);
    const artistMatch = Boolean(actualArtist && guessArtist && checkGuessMatch(guessArtist, actualArtist));

    let pointsAwarded = 0;
    if (titleMatch) pointsAwarded += 2;
    if (artistMatch) pointsAwarded += 1;

    const isCorrect = pointsAwarded > 0 ? 1 : 0;
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO votes (id, room_code, round_id, voter_player_id, voted_player_id, guess_title, guess_artist, points_awarded, is_correct, is_skipped, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, ?)
      `);
      stmt.run(
        id,
        roomCode.toUpperCase(),
        roundId,
        voterPlayerId,
        guessTitle.trim(),
        guessArtist?.trim() || null,
        pointsAwarded,
        isCorrect,
        now
      );

      const vote = this.db.prepare(`SELECT * FROM votes WHERE id = ?`).get(id) as Vote;
      return { success: true, vote, pointsEarned: pointsAwarded };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'You have already submitted a guess for this round.' };
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * Records a skipped vote (abstention).
   * Eligible player chooses not to guess; earns 0 points and counts toward completing voting.
   */
  recordSkipVote(
    id: string,
    roomCode: string,
    roundId: string,
    voterPlayerId: string
  ): { success: boolean; error?: string; vote?: Vote } {
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO votes (id, room_code, round_id, voter_player_id, voted_player_id, guess_title, guess_artist, points_awarded, is_correct, is_skipped, created_at)
        VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, 0, 1, ?)
      `);
      stmt.run(id, roomCode.toUpperCase(), roundId, voterPlayerId, now);

      const vote = this.db.prepare(`SELECT * FROM votes WHERE id = ?`).get(id) as Vote;
      return { success: true, vote };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'You have already completed voting for this round.' };
      }
      return { success: false, error: err.message };
    }
  }

  getPlayerVote(roundId: string, voterPlayerId: string): Vote | null {
    const stmt = this.db.prepare(`
      SELECT * FROM votes 
      WHERE round_id = ? AND voter_player_id = ?
    `);
    const r = stmt.get(roundId, voterPlayerId) as Vote | undefined;
    return r || null;
  }

  hasPlayerVoted(roundId: string, voterPlayerId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM votes 
      WHERE round_id = ? AND voter_player_id = ?
    `);
    const res = stmt.get(roundId, voterPlayerId) as { cnt: number };
    return res.cnt > 0;
  }

  getVotesCountForRound(roundId: string): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM votes WHERE round_id = ?`);
    const res = stmt.get(roundId) as { cnt: number };
    return res.cnt;
  }

  getVotesForRound(roundId: string): Vote[] {
    const stmt = this.db.prepare(`SELECT * FROM votes WHERE round_id = ?`);
    return stmt.all(roundId) as Vote[];
  }

  getPublicVotesForRound(roundId: string): PublicVoteResult[] {
    const stmt = this.db.prepare(`
      SELECT 
        v.voter_player_id as voter_id,
        p1.nickname as voter_nickname,
        v.voted_player_id as voted_id,
        p2.nickname as voted_nickname,
        v.guess_title,
        v.guess_artist,
        v.points_awarded,
        v.is_correct,
        v.is_skipped
      FROM votes v
      LEFT JOIN players p1 ON v.voter_player_id = p1.id
      LEFT JOIN players p2 ON v.voted_player_id = p2.id
      WHERE v.round_id = ?
      ORDER BY v.created_at ASC
    `);
    const rows = stmt.all(roundId) as any[];
    return rows.map((r) => ({
      voter_id: r.voter_id,
      voter_nickname: r.voter_nickname || 'Unknown',
      voted_id: r.voted_id || undefined,
      voted_nickname: r.voted_nickname || undefined,
      guess_title: r.guess_title || undefined,
      guess_artist: r.guess_artist || undefined,
      points_awarded: r.points_awarded || (r.is_correct ? 1 : 0),
      is_correct: Boolean(r.is_correct),
      is_skipped: Boolean(r.is_skipped)
    }));
  }

  /**
   * Database transaction to score a round exactly once:
   * awards points_awarded for each vote, marks round as scored.
   * Returns updated player scores for this round.
   */
  scoreRoundTransaction(roundId: string): {
    alreadyScored: boolean;
    scores: Array<{ player_id: string; nickname: string; score: number; points_earned: number }>;
  } {
    const checkStmt = this.db.prepare(`SELECT is_scored, room_code FROM rounds WHERE id = ?`);
    const round = checkStmt.get(roundId) as { is_scored: number; room_code: string } | undefined;
    if (!round) {
      throw new Error(`Round ${roundId} not found`);
    }

    if (round.is_scored === 1) {
      // Already scored, return current scores with points_earned = 0
      const currentPlayers = this.db.prepare(`
        SELECT id, nickname, score FROM players WHERE room_code = ? ORDER BY score DESC, nickname ASC
      `).all(round.room_code) as Array<{ id: string; nickname: string; score: number }>;
      return {
        alreadyScored: true,
        scores: currentPlayers.map((p) => ({
          player_id: p.id,
          nickname: p.nickname,
          score: p.score,
          points_earned: 0
        }))
      };
    }

    const tx = this.db.transaction(() => {
      // Find all votes with points
      const votes = this.db.prepare(`
        SELECT voter_player_id, points_awarded, is_correct FROM votes WHERE round_id = ?
      `).all(roundId) as Array<{ voter_player_id: string; points_awarded: number; is_correct: number }>;

      const pointMap = new Map<string, number>();
      for (const v of votes) {
        // Fallback for legacy votes table: if points_awarded was not set, use is_correct
        const pts = v.points_awarded !== undefined && v.points_awarded !== null ? v.points_awarded : (v.is_correct ? 1 : 0);
        if (pts > 0) {
          pointMap.set(v.voter_player_id, (pointMap.get(v.voter_player_id) || 0) + pts);
          this.db.prepare(`UPDATE players SET score = score + ? WHERE id = ?`).run(pts, v.voter_player_id);
        }
      }

      // Mark round as scored
      this.db.prepare(`UPDATE rounds SET is_scored = 1 WHERE id = ?`).run(roundId);

      // Fetch all players with updated scores
      const players = this.db.prepare(`
        SELECT id, nickname, score FROM players WHERE room_code = ? ORDER BY score DESC, nickname ASC
      `).all(round.room_code) as Array<{ id: string; nickname: string; score: number }>;

      return players.map((p) => ({
        player_id: p.id,
        nickname: p.nickname,
        score: p.score,
        points_earned: pointMap.get(p.id) || 0
      }));
    });

    const scores = tx();
    return { alreadyScored: false, scores };
  }

  getFinalRankings(roomCode: string): FinalRanking[] {
    const players = this.db.prepare(`
      SELECT id, nickname, score 
      FROM players 
      WHERE room_code = ? 
      ORDER BY score DESC, nickname ASC
    `).all(roomCode.toUpperCase()) as Array<{ id: string; nickname: string; score: number }>;

    if (players.length === 0) return [];

    const topScore = players[0].score;
    let currentRank = 1;

    return players.map((p, index) => {
      // Determine rank (handle ties: identical scores share identical rank)
      if (index > 0 && p.score < players[index - 1].score) {
        currentRank = index + 1;
      }
      return {
        rank: currentRank,
        player_id: p.id,
        nickname: p.nickname,
        score: p.score,
        is_winner: p.score === topScore && topScore > 0 // tie for 1st place if scores equal
      };
    });
  }

  clearRoomRoundsAndVotes(roomCode: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM votes WHERE room_code = ?`).run(roomCode.toUpperCase());
      this.db.prepare(`DELETE FROM rounds WHERE room_code = ?`).run(roomCode.toUpperCase());
    });
    tx();
  }

  addChatMessage(id: string, roomCode: string, playerId: string, nickname: string, message: string): ChatMessage {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (id, room_code, player_id, nickname, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, roomCode.toUpperCase(), playerId, nickname, message, now);
    return { id, room_code: roomCode.toUpperCase(), player_id: playerId, nickname, message, created_at: now };
  }

  getRecentChatMessages(roomCode: string, limit = 50): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chat_messages 
      WHERE room_code = ? 
      ORDER BY created_at ASC 
      LIMIT ?
    `);
    return stmt.all(roomCode.toUpperCase(), limit) as ChatMessage[];
  }
}
