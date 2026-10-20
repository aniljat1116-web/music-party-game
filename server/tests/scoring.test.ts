import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';

describe('Scoring & Leaderboard Engine', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-score-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('awards 1 point for correct guess and 0 for incorrect guess', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    // Host uploaded song
    const song = ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'song1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'song2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'song3.mp3', 'audio/mpeg', 30);

    const round = ctx.gameRepo.createRound('round-1', room.code, 1, song.id, 'voting', null, null);

    // Player 2 correctly guesses Host
    const vote2 = ctx.gameRepo.recordVote('v1', room.code, round.id, p2.player.id, host.id, song.uploader_player_id);
    expect(vote2.success).toBe(true);
    expect(vote2.vote?.is_correct).toBe(1);

    // Player 3 incorrectly guesses Player 2
    const vote3 = ctx.gameRepo.recordVote('v2', room.code, round.id, p3.player.id, p2.player.id, song.uploader_player_id);
    expect(vote3.success).toBe(true);
    expect(vote3.vote?.is_correct).toBe(0);

    // Score the round
    const scoreResult = ctx.gameRepo.scoreRoundTransaction(round.id);
    expect(scoreResult.alreadyScored).toBe(false);

    const p2Score = ctx.playerRepo.getPlayerById(p2.player.id);
    const p3Score = ctx.playerRepo.getPlayerById(p3.player.id);
    const hostScore = ctx.playerRepo.getPlayerById(host.id);

    expect(p2Score?.score).toBe(1);
    expect(p3Score?.score).toBe(0);
    expect(hostScore?.score).toBe(0);
  });

  it('prevents duplicate scoring if scoreRoundTransaction is executed more than once', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const song = ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'song1.mp3', 'audio/mpeg', 30);

    const round = ctx.gameRepo.createRound('round-dup', room.code, 1, song.id, 'voting', null, null);
    ctx.gameRepo.recordVote('v-dup', room.code, round.id, p2.player.id, host.id, song.uploader_player_id);

    // 1st scoring
    const firstScore = ctx.gameRepo.scoreRoundTransaction(round.id);
    expect(firstScore.alreadyScored).toBe(false);
    expect(ctx.playerRepo.getPlayerById(p2.player.id)?.score).toBe(1);

    // 2nd scoring (e.g. repeated event or network retry)
    const secondScore = ctx.gameRepo.scoreRoundTransaction(round.id);
    expect(secondScore.alreadyScored).toBe(true);
    // Score remains 1, NOT 2!
    expect(ctx.playerRepo.getPlayerById(p2.player.id)?.score).toBe(1);
  });

  it('correctly handles ties and rankings in final results', () => {
    const { room, host } = ctx.roomService.createRoom('Alice', 30, 3);
    const bob = ctx.roomService.joinRoom(room.code, 'Bob');
    const charlie = ctx.roomService.joinRoom(room.code, 'Charlie');

    // Alice: 3 points, Bob: 3 points (tie for 1st), Charlie: 1 point
    ctx.playerRepo.updateScore(host.id, 3);
    ctx.playerRepo.updateScore(bob.player.id, 3);
    ctx.playerRepo.updateScore(charlie.player.id, 1);

    const rankings = ctx.gameRepo.getFinalRankings(room.code);
    expect(rankings.length).toBe(3);

    // Both Alice and Bob should have rank 1 and is_winner true
    expect(rankings[0].rank).toBe(1);
    expect(rankings[0].is_winner).toBe(true);
    expect(rankings[1].rank).toBe(1);
    expect(rankings[1].is_winner).toBe(true);

    // Charlie should be rank 3
    expect(rankings[2].rank).toBe(3);
    expect(rankings[2].is_winner).toBe(false);
  });
});
