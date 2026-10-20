import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestContext } from './setup.js';
import { CONFIG } from '../src/config.js';

describe('5-Minute Timers & Skip Mechanics', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-timer-skips-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('configures 5-minute (300 seconds) discussion and voting duration by default', () => {
    expect(CONFIG.DEFAULT_DISCUSSION_SECONDS).toBe(300);
    expect(CONFIG.VOTING_SECONDS).toBe(300);

    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
    expect(room.discussion_duration).toBe(300);

    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'song1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'song2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'song3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;

    // Transition to discussion
    ctx.gameService.transitionToDiscussion(room.code, round.id);
    const discussingRound = ctx.gameRepo.getRoundById(round.id)!;
    expect(discussingRound.phase).toBe('discussing');
    // Phase end should be ~300 seconds in the future
    const discussionRemainingMs = discussingRound.phase_ends_at! - Date.now();
    expect(discussionRemainingMs).toBeGreaterThan(290 * 1000);
    expect(discussionRemainingMs).toBeLessThanOrEqual(300 * 1000 + 1000);

    // Transition to voting
    ctx.gameService.transitionToVoting(room.code, round.id);
    const votingRound = ctx.gameRepo.getRoundById(round.id)!;
    expect(votingRound.phase).toBe('voting');
    const votingRemainingMs = votingRound.phase_ends_at! - Date.now();
    expect(votingRemainingMs).toBeGreaterThan(290 * 1000);
    expect(votingRemainingMs).toBeLessThanOrEqual(300 * 1000 + 1000);
  });

  it('handles discussion skip toggle, consensus among eligible players, and cancellation', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'song1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'song2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'song3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    ctx.gameService.transitionToDiscussion(room.code, round.id);

    // 1. Host skips discussion
    const res1 = ctx.gameService.toggleDiscussionSkip(hostToken, round.id);
    expect(res1.success).toBe(true);
    expect(res1.isReady).toBe(true);
    expect(res1.readyCount).toBe(1);
    expect(res1.totalEligible).toBe(3);

    // Still discussing (consensus not reached)
    let current = ctx.gameRepo.getRoundById(round.id)!;
    expect(current.phase).toBe('discussing');

    // 2. Host cancels readiness
    const resCancel = ctx.gameService.toggleDiscussionSkip(hostToken, round.id);
    expect(resCancel.success).toBe(true);
    expect(resCancel.isReady).toBe(false);
    expect(resCancel.readyCount).toBe(0);

    // 3. Host and Player2 skip
    ctx.gameService.toggleDiscussionSkip(hostToken, round.id);
    const res2 = ctx.gameService.toggleDiscussionSkip(p2.sessionToken, round.id);
    expect(res2.readyCount).toBe(2);
    expect(res2.totalEligible).toBe(3);
    current = ctx.gameRepo.getRoundById(round.id)!;
    expect(current.phase).toBe('discussing');

    // 4. Player3 skips -> 3/3 ready -> consensus reached!
    const res3 = ctx.gameService.toggleDiscussionSkip(p3.sessionToken, round.id);
    expect(res3.readyCount).toBe(3);

    // Immediately transitioned to voting
    current = ctx.gameRepo.getRoundById(round.id)!;
    expect(current.phase).toBe('voting');
  });

  it('rejects discussion skip when phase is not discussing', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    // Round is currently 'playing'
    const res = ctx.gameService.toggleDiscussionSkip(hostToken, round.id);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Discussion phase is not currently active/);
  });

  it('handles voting skip (abstention) and records 0 points without errors', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    ctx.gameService.transitionToDiscussion(room.code, round.id);
    ctx.gameService.transitionToVoting(room.code, round.id);

    const song = ctx.songRepo.getSongById(round.song_id)!;
    const voter = p2.player.id === song.uploader_player_id ? p3 : p2;

    const skipRes = ctx.gameService.skipVote(voter.sessionToken, round.id);
    expect(skipRes.success).toBe(true);

    // Verify vote record
    const recordedVote = ctx.gameRepo.getPlayerVote(round.id, voter.player.id);
    expect(recordedVote).not.toBeNull();
    expect(recordedVote?.is_skipped).toBe(1);
    expect(recordedVote?.points_awarded).toBe(0);

    // Verify game state payload
    const gameState = ctx.gameService.getGameStateForPlayer(voter.sessionToken);
    expect(gameState?.has_voted).toBe(true);
    expect(gameState?.has_skipped_vote).toBe(true);

    // Duplicate skip rejected
    const dupSkip = ctx.gameService.skipVote(voter.sessionToken, round.id);
    expect(dupSkip.success).toBe(false);
    expect(dupSkip.error).toMatch(/already (voted|completed voting)/i);
  });

  it('immediately closes voting and proceeds to reveal when all eligible players have voted or skipped', () => {
    const { room, sessionToken: hostToken, host } = ctx.roomService.createRoom('Host', 300, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    // Make Host the uploader of song 1
    const s1 = ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'host_track.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;

    // Force current round to use Host's song
    ctx.db.prepare('UPDATE rounds SET song_id = ? WHERE id = ?').run(s1.id, round.id);

    ctx.gameService.transitionToDiscussion(room.code, round.id);
    ctx.gameService.transitionToVoting(room.code, round.id);

    // Host cannot vote or skip on their own song
    const hostSkip = ctx.gameService.skipVote(hostToken, round.id);
    expect(hostSkip.success).toBe(false);
    expect(hostSkip.error).toMatch(/uploader/i);

    // Player 2 submits a normal vote
    const voteRes = ctx.gameService.submitVote(p2.sessionToken, round.id, host.id);
    expect(voteRes.success).toBe(true);

    // Voting is still active (1 of 2 eligible players completed)
    let current = ctx.gameRepo.getRoundById(round.id)!;
    expect(current.phase).toBe('voting');

    // Player 3 submits a skipped vote (abstention)
    const p3SkipRes = ctx.gameService.skipVote(p3.sessionToken, round.id);
    expect(p3SkipRes.success).toBe(true);

    // All eligible voters (Player 2 and Player 3) have completed -> immediate reveal!
    current = ctx.gameRepo.getRoundById(round.id)!;
    expect(current.phase).toBe('revealed');

    // Check round results: Host is uploader, Player 2 got +1 pt, Player 3 got +0 pt (abstained)
    const hostState = ctx.gameService.getGameStateForPlayer(hostToken);
    expect(hostState?.phase).toBe('revealed');
    const votes = hostState?.round_result?.votes;
    expect(votes).toBeDefined();
    expect(votes?.length).toBe(2);

    const p2Vote = votes?.find((v) => v.voter_id === p2.player.id);
    expect(p2Vote?.is_correct).toBe(true);
    expect(p2Vote?.points_awarded).toBe(1);
    expect(p2Vote?.is_skipped).toBe(false);

    const p3Vote = votes?.find((v) => v.voter_id === p3.player.id);
    expect(p3Vote?.is_correct).toBe(false);
    expect(p3Vote?.points_awarded).toBe(0);
    expect(p3Vote?.is_skipped).toBe(true);
  });

  it('handles disconnected players gracefully without stalling discussion or voting', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    ctx.gameService.transitionToDiscussion(room.code, round.id);

    // Player 3 disconnects
    ctx.playerRepo.updatePlayerConnection(p3.player.id, false);

    // Host and Player 2 toggle skip discussion
    ctx.gameService.toggleDiscussionSkip(hostToken, round.id);
    ctx.gameService.toggleDiscussionSkip(p2.sessionToken, round.id);

    // Since Player 3 is disconnected, 2/2 connected players are ready -> auto transitions to voting!
    const votingRound = ctx.gameRepo.getRoundById(round.id)!;
    expect(votingRound.phase).toBe('voting');
  });

  it('automatically transitions when 5-minute discussion and voting timers expire', () => {
    vi.useFakeTimers();
    try {
      const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
      const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
      const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

      ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
      ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
      ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

      ctx.gameService.startGame(hostToken);
      const round = ctx.gameRepo.getCurrentRound(room.code)!;

      // Start discussion
      ctx.gameService.transitionToDiscussion(room.code, round.id);
      let current = ctx.gameRepo.getRoundById(round.id)!;
      expect(current.phase).toBe('discussing');

      // Advance timer by 300 seconds (5 minutes)
      vi.advanceTimersByTime(300 * 1000 + 100);

      // Should automatically transition to voting!
      current = ctx.gameRepo.getRoundById(round.id)!;
      expect(current.phase).toBe('voting');

      // Advance timer by 300 seconds (voting expires)
      vi.advanceTimersByTime(300 * 1000 + 100);

      // Should automatically transition to revealed!
      current = ctx.gameRepo.getRoundById(round.id)!;
      expect(current.phase).toBe('revealed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('prevents duplicate transitions via transition locks', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 300, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    ctx.gameService.transitionToDiscussion(room.code, round.id);

    // Call transitionToVoting twice in rapid succession
    ctx.gameService.transitionToVoting(room.code, round.id);
    ctx.gameService.transitionToVoting(room.code, round.id);

    const votingRound = ctx.gameRepo.getRoundById(round.id)!;
    expect(votingRound.phase).toBe('voting');
  });
});
