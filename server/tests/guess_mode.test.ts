import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';
import { normalizeAnswer, checkGuessMatch } from '../src/db/repositories/gameRepo.js';

describe('Guess the Song Game Mode & Answer Normalization', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-guess-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('normalizes answers stripping punctuation, articles, and extra whitespace', () => {
    expect(normalizeAnswer('The Beatles')).toBe('beatles');
    expect(normalizeAnswer('  A   Sky  Full of Stars!  ')).toBe('sky full of stars');
    expect(normalizeAnswer("Don't Stop Believin'")).toBe('dont stop believin');
    expect(normalizeAnswer('Billie Eilish - Bad Guy')).toBe('billie eilish bad guy');

    expect(checkGuessMatch('Bohemian Rhapsody', 'Bohemian Rhapsody')).toBe(true);
    expect(checkGuessMatch('bohemian rhapsody', 'The Bohemian Rhapsody!')).toBe(true);
    expect(checkGuessMatch('Believer', 'Imagine Dragons - Believer')).toBe(true);
    expect(checkGuessMatch('Wrong Song', 'Believer')).toBe(false);
  });

  it('correctly scores Guess the Song mode: 2 points for title and 1 bonus point for artist', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom(
      'Host',
      30,
      3,
      'guess_song',
      30
    );
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    // Host uploads song with title & artist
    const song = ctx.songService.saveSongFile(
      hostToken,
      Buffer.from('mp3'),
      'track1.mp3',
      'audio/mpeg',
      30,
      'Hotel California',
      'Eagles'
    );
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 't2.mp3', 'audio/mpeg', 30, 'Song Two', 'Artist B');
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 't3.mp3', 'audio/mpeg', 30, 'Song Three', 'Artist C');

    // Explicitly create round for Host's song in voting phase
    const round = ctx.gameRepo.createRound('round-guess-1', room.code, 1, song.id, 'voting', null, null);

    // Player 2 guesses both title and artist correctly -> 2 + 1 = 3 pts
    const p2Guess = ctx.gameService.submitGuess(
      p2.sessionToken,
      round.id,
      'Hotel California',
      'The Eagles'
    );
    expect(p2Guess.success).toBe(true);
    expect(p2Guess.pointsEarned).toBe(3);

    // Player 3 guesses only title correctly -> 2 pts
    const p3Guess = ctx.gameService.submitGuess(
      p3.sessionToken,
      round.id,
      'Hotel California',
      'Queen'
    );
    expect(p3Guess.success).toBe(true);
    expect(p3Guess.pointsEarned).toBe(2);

    // Score round
    ctx.gameRepo.scoreRoundTransaction(round.id);

    const p2Updated = ctx.playerRepo.getPlayerById(p2.player.id);
    const p3Updated = ctx.playerRepo.getPlayerById(p3.player.id);
    expect(p2Updated?.score).toBe(3);
    expect(p3Updated?.score).toBe(2);
  });

  it('prevents uploader from guessing on their own uploaded song in Guess the Song mode', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom(
      'Host',
      30,
      3,
      'guess_song'
    );
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 's1.mp3', 'audio/mpeg', 30, 'My Track', 'My Band');
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 's2.mp3', 'audio/mpeg', 30, 'Song 2', 'Artist 2');
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 's3.mp3', 'audio/mpeg', 30, 'Song 3', 'Artist 3');

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    const song = ctx.songRepo.getSongById(round.song_id)!;

    ctx.gameService.transitionToDiscussion(room.code, round.id);
    ctx.gameService.transitionToVoting(room.code, round.id);

    const uploaderToken =
      song.uploader_player_id === host.id
        ? hostToken
        : song.uploader_player_id === p2.player.id
        ? p2.sessionToken
        : p3.sessionToken;

    const guessRes = ctx.gameService.submitGuess(uploaderToken, round.id, 'My Track', 'My Band');
    expect(guessRes.success).toBe(false);
    expect(guessRes.error).toMatch(/cannot guess your own song/i);
  });

  it('keeps song title and artist hidden from other players during active playback and voting', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom(
      'Host',
      30,
      3,
      'guess_song'
    );
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');
    const p3 = ctx.roomService.joinRoom(room.code, 'Player3');

    ctx.songService.saveSongFile(hostToken, Buffer.from('mp3'), 'secret_track.mp3', 'audio/mpeg', 30, 'Secret Hit', 'Top Artist');
    ctx.songService.saveSongFile(p2.sessionToken, Buffer.from('mp3'), 'song2.mp3', 'audio/mpeg', 30, 'Title 2', 'Artist 2');
    ctx.songService.saveSongFile(p3.sessionToken, Buffer.from('mp3'), 'song3.mp3', 'audio/mpeg', 30, 'Title 3', 'Artist 3');

    ctx.gameService.startGame(hostToken);
    const round = ctx.gameRepo.getCurrentRound(room.code)!;
    const song = ctx.songRepo.getSongById(round.song_id)!;

    // A non-uploader player inspects their game state
    const nonUploaderToken = song.uploader_player_id === hostToken ? p2.sessionToken : (song.uploader_player_id === p2.player.id ? hostToken : p2.sessionToken);
    const state = ctx.gameService.getGameStateForPlayer(nonUploaderToken);

    expect(state).not.toBeNull();
    // Title, artist, and uploader must be hidden!
    expect(state?.current_song?.title).toBeUndefined();
    expect(state?.current_song?.artist).toBeUndefined();
    expect(state?.current_song?.uploader_id).toBeUndefined();
    expect(state?.current_song?.uploader_nickname).toBeUndefined();
    expect(state?.current_song?.original_filename).toBe('Mystery Audio Track');
  });
});
