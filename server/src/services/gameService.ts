import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import { RoomRepo } from '../db/repositories/roomRepo.js';
import { PlayerRepo } from '../db/repositories/playerRepo.js';
import { SongRepo } from '../db/repositories/songRepo.js';
import { GameRepo } from '../db/repositories/gameRepo.js';
import {
  Room,
  Round,
  Song,
  GameStatePayload,
  RoundResultData,
  FinalRanking,
  ReactionEvent
} from '../types/index.js';

export type GameEventCallback = (roomCode: string, eventName: string, data: any) => void;

const ALLOWED_REACTIONS = ['🔥', '💃', '🎵', '🤔', '😱', '👏', '🎉', '❤️'];

export class GameService {
  private roomRepo: RoomRepo;
  private playerRepo: PlayerRepo;
  private songRepo: SongRepo;
  private gameRepo: GameRepo;
  private onGameEvent: GameEventCallback | null = null;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private reactionCooldowns: Map<string, number> = new Map(); // playerId -> timestamp
  private discussionSkips: Map<string, Set<string>> = new Map(); // roundId -> Set of playerIds
  private transitionLocks: Set<string> = new Set(); // guard against duplicate concurrent phase transitions

  constructor(
    roomRepo?: RoomRepo,
    playerRepo?: PlayerRepo,
    songRepo?: SongRepo,
    gameRepo?: GameRepo
  ) {
    this.roomRepo = roomRepo || new RoomRepo();
    this.playerRepo = playerRepo || new PlayerRepo();
    this.songRepo = songRepo || new SongRepo();
    this.gameRepo = gameRepo || new GameRepo();
  }

  setEventCallback(cb: GameEventCallback): void {
    this.onGameEvent = cb;
  }

  private clearRoomTimer(roomCode: string): void {
    const timer = this.activeTimers.get(roomCode.toUpperCase());
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(roomCode.toUpperCase());
    }
  }

  private setRoomTimer(roomCode: string, ms: number, fn: () => void): void {
    this.clearRoomTimer(roomCode);
    const timer = setTimeout(() => {
      this.activeTimers.delete(roomCode.toUpperCase());
      fn();
    }, Math.max(0, ms));
    this.activeTimers.set(roomCode.toUpperCase(), timer);
  }

  startGame(sessionToken: string): { room: Room; round: Round } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (!player.is_host) throw new Error('Only the room leader can start the game.');
    if (room.status !== 'lobby') throw new Error('Game has already started.');

    const players = this.playerRepo.getPlayersInRoom(room.code);
    if (players.length < CONFIG.MIN_PLAYERS_TO_START) {
      throw new Error(`At least ${CONFIG.MIN_PLAYERS_TO_START} players are required to start the game.`);
    }

    const availableSongs = this.songRepo.getUnplayedSongsInRoom(room.code);
    if (availableSongs.length < room.total_rounds) {
      const needed = room.total_rounds - availableSongs.length;
      throw new Error(
        `Insufficient songs: Need ${room.total_rounds} songs for ${room.total_rounds} rounds, but only ${availableSongs.length} uploaded. Please upload ${needed} more song(s) or reduce the number of rounds in settings.`
      );
    }

    // Reset scores & set status to playing
    this.playerRepo.resetScores(room.code);
    this.roomRepo.updateRoomStatus(room.code, 'playing');

    // Start round 1
    const round = this.startNewRound(room.code, 1, null);
    return { room: this.roomRepo.getRoomByCode(room.code)!, round };
  }

  private selectNextSong(roomCode: string, previousUploaderId: string | null): Song {
    const unplayed = this.songRepo.getUnplayedSongsInRoom(roomCode);
    if (unplayed.length === 0) {
      throw new Error('No more unplayed songs available.');
    }

    // Attempt to avoid consecutive songs by same uploader
    let candidates = unplayed;
    if (previousUploaderId && unplayed.length > 1) {
      const filtered = unplayed.filter((s) => s.uploader_player_id !== previousUploaderId);
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    // Random selection from candidates
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return selected;
  }

  startNewRound(roomCode: string, roundNumber: number, previousUploaderId: string | null): Round {
    const room = this.roomRepo.getRoomByCode(roomCode);
    if (!room) throw new Error('Room not found.');

    const song = this.selectNextSong(roomCode, previousUploaderId);
    this.songRepo.markSongPlayed(song.id, roundNumber);
    this.roomRepo.updateRoomRound(roomCode, roundNumber);

    const roundId = uuidv4();
    const clipDuration = room.clip_duration || 30;
    const duration = Math.min(clipDuration, song.duration_seconds || clipDuration);
    const now = Date.now();
    const playbackStartTime = now + CONFIG.PLAYBACK_BUFFER_SECONDS * 1000;
    const phaseEndsAt = playbackStartTime + duration * 1000;

    const round = this.gameRepo.createRound(
      roundId,
      roomCode,
      roundNumber,
      song.id,
      'playing',
      playbackStartTime,
      phaseEndsAt
    );

    // Schedule transition to discussion
    const timeUntilDiscussion = Math.max(100, phaseEndsAt - Date.now());
    this.setRoomTimer(roomCode, timeUntilDiscussion, () => {
      this.transitionToDiscussion(roomCode, roundId);
    });

    if (this.onGameEvent) {
      this.onGameEvent(roomCode, 'game:state_changed', { roundId, phase: 'playing' });
    }

    return round;
  }

  transitionToDiscussion(roomCode: string, roundId: string): void {
    const lockKey = `${roundId}-discussing`;
    if (this.transitionLocks.has(lockKey)) return;
    this.transitionLocks.add(lockKey);

    const room = this.roomRepo.getRoomByCode(roomCode);
    const round = this.gameRepo.getRoundById(roundId);
    if (!room || !round || round.phase !== 'playing') {
      this.transitionLocks.delete(lockKey);
      return;
    }

    // Discussion duration defaults to 300 seconds (5 minutes)
    const duration = room.discussion_duration || CONFIG.DEFAULT_DISCUSSION_SECONDS;
    const phaseEndsAt = Date.now() + duration * 1000;

    this.gameRepo.updateRoundPhase(roundId, 'discussing', phaseEndsAt);
    this.discussionSkips.delete(roundId);

    // Schedule automatic transition to voting when 5-minute timer expires
    this.setRoomTimer(roomCode, duration * 1000, () => {
      this.transitionToVoting(roomCode, roundId);
    });

    if (this.onGameEvent) {
      this.onGameEvent(roomCode, 'game:state_changed', { roundId, phase: 'discussing' });
    }
  }

  transitionToVoting(roomCode: string, roundId: string): void {
    const lockKey = `${roundId}-voting`;
    if (this.transitionLocks.has(lockKey)) return;
    this.transitionLocks.add(lockKey);

    const room = this.roomRepo.getRoomByCode(roomCode);
    const round = this.gameRepo.getRoundById(roundId);
    if (!room || !round || round.phase !== 'discussing') {
      this.transitionLocks.delete(lockKey);
      return;
    }

    // Voting duration defaults to 300 seconds (5 minutes)
    const duration = CONFIG.VOTING_SECONDS;
    const phaseEndsAt = Date.now() + duration * 1000;

    this.gameRepo.updateRoundPhase(roundId, 'voting', phaseEndsAt);

    // Schedule automatic transition to reveal if voting timer expires
    this.setRoomTimer(roomCode, duration * 1000, () => {
      this.revealRound(roomCode, roundId);
    });

    if (this.onGameEvent) {
      this.onGameEvent(roomCode, 'game:state_changed', { roundId, phase: 'voting' });
    }
  }

  /**
   * Toggles a player's readiness to skip the discussion phase.
   * If all eligible (connected) players in the room are ready, ends discussion immediately and transitions to voting.
   */
  toggleDiscussionSkip(
    sessionToken: string,
    roundId: string
  ): { success: boolean; error?: string; isReady: boolean; readyCount: number; totalEligible: number } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) return { success: false, error: 'Unauthorized session.', isReady: false, readyCount: 0, totalEligible: 0 };

    const round = this.gameRepo.getRoundById(roundId);
    if (!round) return { success: false, error: 'Round not found.', isReady: false, readyCount: 0, totalEligible: 0 };

    if (round.phase !== 'discussing') {
      return { success: false, error: 'Discussion phase is not currently active.', isReady: false, readyCount: 0, totalEligible: 0 };
    }

    let skips = this.discussionSkips.get(roundId);
    if (!skips) {
      skips = new Set<string>();
      this.discussionSkips.set(roundId, skips);
    }

    // Toggle readiness
    const isNowReady = !skips.has(player.id);
    if (isNowReady) {
      skips.add(player.id);
    } else {
      skips.delete(player.id);
    }

    const allPlayers = this.playerRepo.getPlayersInRoom(round.room_code);
    const connectedPlayers = allPlayers.filter((p) => p.connected === 1);
    const readyCount = connectedPlayers.filter((p) => skips!.has(p.id)).length;
    const totalEligible = connectedPlayers.length;

    if (this.onGameEvent) {
      this.onGameEvent(round.room_code, 'game:discussion_skip_update', {
        readyCount,
        totalEligible,
        readyPlayerIds: Array.from(skips)
      });
    }

    // If ALL connected eligible players pressed Skip Discussion, end discussion immediately!
    if (readyCount >= totalEligible && totalEligible > 0) {
      this.clearRoomTimer(round.room_code);
      this.transitionToVoting(round.room_code, roundId);
    }

    return {
      success: true,
      isReady: isNowReady,
      readyCount,
      totalEligible
    };
  }

  /**
   * Submits a private vote in "Who Added This Song" mode.
   */
  submitVote(
    sessionToken: string,
    roundId: string,
    votedPlayerId: string
  ): { success: boolean; error?: string } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) return { success: false, error: 'Unauthorized session.' };

    const round = this.gameRepo.getRoundById(roundId);
    if (!round) return { success: false, error: 'Round not found.' };

    if (round.phase !== 'voting') {
      return { success: false, error: 'Voting is not currently active.' };
    }

    const song = this.songRepo.getSongById(round.song_id);
    if (!song) return { success: false, error: 'Song not found.' };

    // Uploader cannot vote on their own song
    if (player.id === song.uploader_player_id) {
      return { success: false, error: 'You cannot vote on your own song!' };
    }

    // Target must exist in the same room
    const target = this.playerRepo.getPlayerById(votedPlayerId);
    if (!target || target.room_code !== round.room_code) {
      return { success: false, error: 'Invalid vote target.' };
    }

    const voteId = uuidv4();
    const result = this.gameRepo.recordVote(
      voteId,
      round.room_code,
      roundId,
      player.id,
      votedPlayerId,
      song.uploader_player_id
    );

    if (!result.success) {
      return result;
    }

    // Check if all eligible players have voted or skipped
    this.checkEarlyReveal(round, song.uploader_player_id);

    return { success: true };
  }

  /**
   * Submits a private guess in "Guess the Song" mode.
   */
  submitGuess(
    sessionToken: string,
    roundId: string,
    guessTitle: string,
    guessArtist?: string
  ): { success: boolean; error?: string; pointsEarned?: number } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) return { success: false, error: 'Unauthorized session.' };

    const round = this.gameRepo.getRoundById(roundId);
    if (!round) return { success: false, error: 'Round not found.' };

    if (round.phase !== 'voting') {
      return { success: false, error: 'Guess submission is not currently active.' };
    }

    const song = this.songRepo.getSongById(round.song_id);
    if (!song) return { success: false, error: 'Song not found.' };

    // Uploader cannot guess their own song
    if (player.id === song.uploader_player_id) {
      return { success: false, error: 'You cannot guess your own song!' };
    }

    if (!guessTitle || !guessTitle.trim()) {
      return { success: false, error: 'Please enter a song title guess.' };
    }

    const voteId = uuidv4();
    const actualTitle = song.title || song.original_filename;
    const actualArtist = song.artist || null;

    const result = this.gameRepo.recordGuess(
      voteId,
      round.room_code,
      roundId,
      player.id,
      guessTitle,
      guessArtist,
      actualTitle,
      actualArtist
    );

    if (!result.success) {
      return result;
    }

    // Check if all eligible players have guessed or skipped
    this.checkEarlyReveal(round, song.uploader_player_id);

    return { success: true, pointsEarned: result.pointsEarned };
  }

  /**
   * Explicitly skips voting (abstention).
   * Eligible player chooses not to submit a guess. Counts toward closing voting immediately without points.
   */
  skipVote(
    sessionToken: string,
    roundId: string
  ): { success: boolean; error?: string } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) return { success: false, error: 'Unauthorized session.' };

    const round = this.gameRepo.getRoundById(roundId);
    if (!round) return { success: false, error: 'Round not found.' };

    if (round.phase !== 'voting') {
      return { success: false, error: 'Voting is not currently active.' };
    }

    const song = this.songRepo.getSongById(round.song_id);
    if (!song) return { success: false, error: 'Song not found.' };

    // Uploader is not an eligible voter
    if (player.id === song.uploader_player_id) {
      return { success: false, error: 'You are the uploader of this track.' };
    }

    const voteId = uuidv4();
    const result = this.gameRepo.recordSkipVote(
      voteId,
      round.room_code,
      roundId,
      player.id
    );

    if (!result.success) {
      return result;
    }

    // Check if all eligible players have now voted or skipped
    this.checkEarlyReveal(round, song.uploader_player_id);

    return { success: true };
  }

  /**
   * Checks if all eligible connected voters have completed voting or skipped.
   * If complete, immediately closes voting and proceeds to reveal.
   */
  checkEarlyReveal(round: Round, uploaderPlayerId: string): void {
    if (round.phase !== 'voting') return;

    const allPlayers = this.playerRepo.getPlayersInRoom(round.room_code);
    const eligibleVoters = allPlayers.filter(
      (p) => p.connected === 1 && p.id !== uploaderPlayerId
    );
    const votesCount = this.gameRepo.getVotesCountForRound(round.id);

    if (this.onGameEvent) {
      this.onGameEvent(round.room_code, 'game:vote_cast', {
        votesCount,
        totalEligible: eligibleVoters.length
      });
    }

    if (votesCount >= eligibleVoters.length && eligibleVoters.length > 0) {
      // Early reveal!
      this.clearRoomTimer(round.room_code);
      this.revealRound(round.room_code, round.id);
    }
  }

  /**
   * Re-evaluates active phase readiness when a player disconnects,
   * ensuring one disconnected player cannot keep a room stalled.
   */
  handlePlayerDisconnectCheck(roomCode: string): void {
    const currentRound = this.gameRepo.getCurrentRound(roomCode);
    if (!currentRound) return;

    if (currentRound.phase === 'discussing') {
      const allPlayers = this.playerRepo.getPlayersInRoom(roomCode);
      const connectedPlayers = allPlayers.filter((p) => p.connected === 1);
      const skips = this.discussionSkips.get(currentRound.id);
      if (skips && connectedPlayers.length > 0) {
        const readyCount = connectedPlayers.filter((p) => skips.has(p.id)).length;
        if (readyCount >= connectedPlayers.length) {
          this.clearRoomTimer(roomCode);
          this.transitionToVoting(roomCode, currentRound.id);
        }
      }
    } else if (currentRound.phase === 'voting') {
      const song = this.songRepo.getSongById(currentRound.song_id);
      if (song) {
        this.checkEarlyReveal(currentRound, song.uploader_player_id);
      }
    }
  }

  revealRound(roomCode: string, roundId: string): void {
    const lockKey = `${roundId}-revealed`;
    if (this.transitionLocks.has(lockKey)) return;
    this.transitionLocks.add(lockKey);

    const room = this.roomRepo.getRoomByCode(roomCode);
    const round = this.gameRepo.getRoundById(roundId);
    if (!room || !round) {
      this.transitionLocks.delete(lockKey);
      return;
    }

    const phaseEndsAt = Date.now() + CONFIG.REVEAL_SECONDS * 1000;
    this.gameRepo.updateRoundPhase(roundId, 'revealed', phaseEndsAt);
    this.discussionSkips.delete(roundId);

    // Score the round with atomic transaction
    this.gameRepo.scoreRoundTransaction(roundId);

    // Prepare next step after reveal countdown
    this.setRoomTimer(roomCode, CONFIG.REVEAL_SECONDS * 1000, () => {
      this.nextRoundOrFinish(roomCode, round);
    });

    if (this.onGameEvent) {
      this.onGameEvent(roomCode, 'game:state_changed', { roundId, phase: 'revealed' });
    }
  }

  nextRoundOrFinish(roomCode: string, currentRound: Round): void {
    const room = this.roomRepo.getRoomByCode(roomCode);
    if (!room) return;

    if (currentRound.round_number < room.total_rounds) {
      // Start next round
      const song = this.songRepo.getSongById(currentRound.song_id);
      const prevUploader = song ? song.uploader_player_id : null;
      this.startNewRound(roomCode, currentRound.round_number + 1, prevUploader);
    } else {
      // Game complete!
      this.roomRepo.updateRoomStatus(roomCode, 'finished');
      this.clearRoomTimer(roomCode);

      if (this.onGameEvent) {
        this.onGameEvent(roomCode, 'game:finished', {
          rankings: this.gameRepo.getFinalRankings(roomCode)
        });
      }
    }
  }

  returnToLobby(sessionToken: string): { room: Room } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (!player.is_host) throw new Error('Only the room leader can return the room to the lobby.');

    this.clearRoomTimer(room.code);
    this.discussionSkips.clear();
    this.transitionLocks.clear();
    this.roomRepo.resetRoomToLobby(room.code);
    this.songRepo.resetSongsPlayedStatus(room.code);
    this.playerRepo.resetScores(room.code);
    this.playerRepo.setAllPlayersUnready(room.code);

    const updated = this.roomRepo.getRoomByCode(room.code)!;
    if (this.onGameEvent) {
      this.onGameEvent(room.code, 'room:returned_to_lobby', { room: updated });
    }

    return { room: updated };
  }

  rematch(sessionToken: string): { room: Room } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (!player.is_host) throw new Error('Only the room leader can trigger a rematch.');

    this.clearRoomTimer(room.code);
    this.discussionSkips.clear();
    this.transitionLocks.clear();
    this.gameRepo.clearRoomRoundsAndVotes(room.code);
    this.roomRepo.resetRoomToLobby(room.code);
    this.songRepo.resetSongsPlayedStatus(room.code);
    this.playerRepo.resetScores(room.code);
    this.playerRepo.setAllPlayersUnready(room.code);

    const updated = this.roomRepo.getRoomByCode(room.code)!;
    if (this.onGameEvent) {
      this.onGameEvent(room.code, 'game:rematch_ready', { room: updated });
    }

    return { room: updated };
  }

  submitReaction(sessionToken: string, emoji: string): ReactionEvent {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    if (!ALLOWED_REACTIONS.includes(emoji)) {
      throw new Error('Invalid emoji reaction.');
    }

    const now = Date.now();
    const lastReaction = this.reactionCooldowns.get(player.id) || 0;
    if (now - lastReaction < 1200) {
      throw new Error('Reaction cooldown active. Please wait a moment.');
    }

    this.reactionCooldowns.set(player.id, now);

    const event: ReactionEvent = {
      id: uuidv4(),
      player_id: player.id,
      nickname: player.nickname,
      emoji,
      timestamp: now
    };

    if (this.onGameEvent) {
      this.onGameEvent(player.room_code, 'game:reaction', event);
    }

    return event;
  }

  getGameStateForPlayer(sessionToken: string): GameStatePayload | null {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) return null;

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) return null;

    const gameMode = room.game_mode || 'who_added';
    const clipDuration = room.clip_duration || 30;

    if (room.status === 'lobby') {
      return {
        room_code: room.code,
        status: 'lobby',
        game_mode: gameMode,
        clip_duration: clipDuration,
        current_round: 0,
        total_rounds: room.total_rounds,
        discussion_duration: room.discussion_duration,
        phase: null,
        phase_ends_at: null,
        playback_start_time: null
      };
    }

    const currentRound = this.gameRepo.getCurrentRound(room.code);
    if (!currentRound) {
      return {
        room_code: room.code,
        status: room.status,
        game_mode: gameMode,
        clip_duration: clipDuration,
        current_round: room.current_round,
        total_rounds: room.total_rounds,
        discussion_duration: room.discussion_duration,
        phase: null,
        phase_ends_at: null,
        playback_start_time: null
      };
    }

    const currentSong = this.songRepo.getSongById(currentRound.song_id);
    const isUploader = currentSong ? currentSong.uploader_player_id === player.id : false;
    const isRevealed = currentRound.phase === 'revealed';
    const isFinished = room.status === 'finished';

    let roundResult: RoundResultData | null = null;
    if (isRevealed && currentSong) {
      const uploaderPlayer = this.playerRepo.getPlayerById(currentSong.uploader_player_id);
      const publicVotes = this.gameRepo.getPublicVotesForRound(currentRound.id);
      const scoresInfo = this.gameRepo.scoreRoundTransaction(currentRound.id).scores;

      roundResult = {
        round_number: currentRound.round_number,
        song_id: currentSong.id,
        song_title: currentSong.title || currentSong.original_filename,
        artist: currentSong.artist || undefined,
        artwork_url: currentSong.artwork_url || undefined,
        uploader_id: currentSong.uploader_player_id,
        uploader_nickname: uploaderPlayer ? uploaderPlayer.nickname : 'Unknown',
        votes: publicVotes,
        scores: scoresInfo
      };
    }

    const playerVote = this.gameRepo.getPlayerVote(currentRound.id, player.id);
    const hasVoted = Boolean(playerVote);
    const hasSkippedVote = Boolean(playerVote && playerVote.is_skipped === 1);

    const votesCount = this.gameRepo.getVotesCountForRound(currentRound.id);
    const allPlayers = this.playerRepo.getPlayersInRoom(room.code);
    const eligibleVotersCount = currentSong
      ? allPlayers.filter((p) => p.connected === 1 && p.id !== currentSong.uploader_player_id).length
      : allPlayers.length;

    // Discussion skip counts
    const connectedPlayers = allPlayers.filter((p) => p.connected === 1);
    const roundSkips = this.discussionSkips.get(currentRound.id);
    const discussionSkipsCount = roundSkips
      ? connectedPlayers.filter((p) => roundSkips.has(p.id)).length
      : 0;
    const hasSkippedDiscussion = Boolean(roundSkips && roundSkips.has(player.id));

    let finalRankings: FinalRanking[] | null = null;
    if (isFinished) {
      finalRankings = this.gameRepo.getFinalRankings(room.code);
    }

    let sanitizedSong: GameStatePayload['current_song'] = null;
    if (currentSong) {
      const effectiveDuration = Math.min(clipDuration, currentSong.duration_seconds || clipDuration);
      if (isRevealed) {
        sanitizedSong = {
          id: currentSong.id,
          original_filename: currentSong.original_filename,
          duration_seconds: effectiveDuration,
          title: currentSong.title || currentSong.original_filename,
          artist: currentSong.artist || undefined,
          source_type: currentSong.source_type,
          external_id: currentSong.external_id,
          artwork_url: currentSong.artwork_url || undefined,
          uploader_id: currentSong.uploader_player_id,
          uploader_nickname: this.playerRepo.getPlayerById(currentSong.uploader_player_id)?.nickname
        };
      } else if (gameMode === 'guess_song') {
        if (isUploader) {
          sanitizedSong = {
            id: currentSong.id,
            original_filename: currentSong.original_filename,
            duration_seconds: effectiveDuration,
            title: currentSong.title || undefined,
            artist: currentSong.artist || undefined,
            source_type: currentSong.source_type,
            external_id: currentSong.external_id,
            artwork_url: currentSong.artwork_url || undefined
          };
        } else {
          sanitizedSong = {
            id: currentSong.id,
            original_filename: 'Mystery Audio Track',
            duration_seconds: effectiveDuration,
            source_type: currentSong.source_type,
            external_id: currentSong.external_id
          };
        }
      } else {
        sanitizedSong = {
          id: currentSong.id,
          original_filename: currentSong.original_filename,
          duration_seconds: effectiveDuration,
          source_type: currentSong.source_type,
          external_id: currentSong.external_id,
          artwork_url: currentSong.artwork_url || undefined
        };
      }
    }

    return {
      room_code: room.code,
      round_id: currentRound.id,
      status: room.status,
      game_mode: gameMode,
      clip_duration: clipDuration,
      current_round: currentRound.round_number,
      total_rounds: room.total_rounds,
      discussion_duration: room.discussion_duration,
      phase: currentRound.phase,
      phase_ends_at: currentRound.phase_ends_at,
      playback_start_time: currentRound.playback_start_time,
      current_song: sanitizedSong,
      is_my_song: isUploader,
      has_voted: hasVoted,
      has_skipped_vote: hasSkippedVote,
      votes_submitted_count: votesCount,
      total_eligible_voters: eligibleVotersCount,
      discussion_skips_count: discussionSkipsCount,
      total_discussion_eligible: connectedPlayers.length,
      has_skipped_discussion: hasSkippedDiscussion,
      round_result: roundResult,
      final_rankings: finalRankings
    };
  }

  getGameRepo(): GameRepo {
    return this.gameRepo;
  }
}
