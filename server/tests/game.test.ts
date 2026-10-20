import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';

describe('Game Rules & Round Flow', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-game-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('requires at least 3 players before starting the game', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    ctx.roomService.joinRoom(room.code, 'Player2');

    // Only 2 players
    expect(() => {
      ctx.gameService.startGame(hostToken);
    }).toThrow(/At least 3 players are required/);
  });

  it('rejects starting a game with insufficient songs and explains missing count', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    // Total rounds is 3, upload only 1 song
    ctx.songService.saveSongFile(
      hostToken,
      Buffer.from('mp3'),
      'song1.mp3',
      'audio/mpeg',
      30
    );

    expect(() => {
      ctx.gameService.startGame(hostToken);
    }).toThrow(/Insufficient songs: Need 3 songs for 3 rounds, but only 1 uploaded\. Please upload 2 more song\(s\)/);
  });

  it('starts game and selects unplayed song hiding uploader identity during active play', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    // Upload 3 songs
    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'song1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'song2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'song3.mp3', 'audio/mpeg', 30);

    const startRes = ctx.gameService.startGame(hostToken);
    expect(startRes.room.status).toBe('playing');
    expect(startRes.round.round_number).toBe(1);
    expect(startRes.round.phase).toBe('playing');

    // Check game state for Player 2
    const p2State = ctx.gameService.getGameStateForPlayer(p2.sessionToken);
    expect(p2State).not.toBeNull();
    expect(p2State?.current_song?.original_filename).toBeDefined();
    // In playing phase, uploader_id and uploader_nickname MUST be undefined!
    expect(p2State?.current_song?.uploader_id).toBeUndefined();
    expect(p2State?.current_song?.uploader_nickname).toBeUndefined();
  });

  it('prevents the song uploader from voting on their own song', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    // Upload songs
    const s1 = ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'host_song.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'p2_song.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'p3_song.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;

    // Transition round to voting phase
    ctx.gameService.transitionToDiscussion(room.code, round.id);
    ctx.gameService.transitionToVoting(room.code, round.id);

    const song = ctx.songRepo.getSongById(round.song_id)!;
    const uploaderToken = song.uploader_player_id === p2.player.id
      ? p2.sessionToken
      : song.uploader_player_id === p3.player.id
      ? p3.sessionToken
      : hostToken;

    // Uploader tries to vote
    const voteRes = ctx.gameService.submitVote(uploaderToken, round.id, p2.player.id);
    expect(voteRes.success).toBe(false);
    expect(voteRes.error).toMatch(/cannot vote on your own song/);
  });

  it('allows only one vote per eligible player and rejects duplicate votes', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    const song = ctx.songRepo.getSongById(round.song_id)!;

    ctx.gameService.transitionToDiscussion(room.code, round.id);
    ctx.gameService.transitionToVoting(room.code, round.id);

    // Pick an eligible voter who is NOT the uploader
    const eligibleToken = song.uploader_player_id === host.id ? p2.sessionToken : hostToken;

    // First vote succeeds
    const firstVote = ctx.gameService.submitVote(eligibleToken, round.id, p3.player.id);
    expect(firstVote.success).toBe(true);

    // Second vote from same player is rejected
    const secondVote = ctx.gameService.submitVote(eligibleToken, round.id, p2.player.id);
    expect(secondVote.success).toBe(false);
    expect(secondVote.error).toMatch(/already voted/);
  });

  it('reveals round results with uploader and scores after voting', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30);
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30);

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;

    // Reveal round
    ctx.gameService.revealRound(room.code, round.id);

    const state = ctx.gameService.getGameStateForPlayer(hostToken);
    expect(state?.phase).toBe('revealed');
    expect(state?.round_result).toBeDefined();
    expect(state?.round_result?.uploader_nickname).toBeDefined();
    expect(state?.round_result?.song_title).toBeDefined();
  });
});
