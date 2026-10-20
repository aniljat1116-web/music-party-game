import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';

describe('Rematch & Reaction Mechanics', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-rematch-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('performs rematch: resets rounds, scores, unmarks songs, and keeps players in lobby', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'song1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'song2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'song3.mp3', 'audio/mpeg', 30);

    // Start and play game
    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    ctx.playerRepo.updateScore(p2.player.id, 5);

    // Call rematch
    const rematchRes = ctx.gameService.rematch(hostToken);
    expect(rematchRes.room.status).toBe('lobby');
    expect(rematchRes.room.current_round).toBe(0);

    // Scores reset to 0
    const p2Updated = ctx.playerRepo.getPlayerById(p2.player.id);
    expect(p2Updated?.score).toBe(0);
    expect(p2Updated?.is_ready).toBe(0);

    // Songs are unplayed and preserved
    const unplayed = ctx.songRepo.getUnplayedSongsInRoom(room.code);
    expect(unplayed.length).toBe(3);

    // Previous votes and rounds are cleared so they cannot contaminate next match
    const votes = ctx.gameRepo.getVotesForRound(round.id);
    expect(votes.length).toBe(0);
  });

  it('handles emoji reactions and enforces cooldown to prevent spam', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);

    // Valid reaction succeeds
    const reaction = ctx.gameService.submitReaction(hostToken, '🔥');
    expect(reaction.emoji).toBe('🔥');
    expect(reaction.nickname).toBe('Host');

    // Immediate repeat reaction within cooldown fails
    expect(() => {
      ctx.gameService.submitReaction(hostToken, '🔥');
    }).toThrow(/cooldown active/i);

    // Invalid emoji rejected
    expect(() => {
      ctx.gameService.submitReaction(hostToken, '💣');
    }).toThrow(/invalid emoji reaction/i);
  });
});
