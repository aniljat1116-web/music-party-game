import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import { RoomRepo } from '../db/repositories/roomRepo.js';
import { PlayerRepo } from '../db/repositories/playerRepo.js';
import { Room, Player, PublicPlayer, GameMode } from '../types/index.js';

export class RoomService {
  private roomRepo: RoomRepo;
  private playerRepo: PlayerRepo;

  constructor(roomRepo?: RoomRepo, playerRepo?: PlayerRepo) {
    this.roomRepo = roomRepo || new RoomRepo();
    this.playerRepo = playerRepo || new PlayerRepo();
  }

  generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous 0, O, 1, I
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  createRoom(
    nickname: string,
    discussionDuration: number = CONFIG.DEFAULT_DISCUSSION_SECONDS,
    totalRounds: number = 5,
    gameMode: GameMode = 'who_added',
    clipDuration: number = 30
  ): { room: Room; host: Player; sessionToken: string } {
    const trimmedNick = nickname.trim();
    if (!trimmedNick || trimmedNick.length < 2 || trimmedNick.length > 20) {
      throw new Error('Nickname must be between 2 and 20 characters.');
    }

    if (![15, 30, 45, 60, 120, 180, 300].includes(discussionDuration)) {
      discussionDuration = CONFIG.DEFAULT_DISCUSSION_SECONDS;
    }

    if (![15, 30, 45, 60].includes(clipDuration)) {
      clipDuration = 30;
    }

    if (!['who_added', 'guess_song'].includes(gameMode)) {
      gameMode = 'who_added';
    }

    if (totalRounds < CONFIG.MIN_ROUNDS || totalRounds > CONFIG.MAX_ROUNDS) {
      throw new Error(`Total rounds must be between ${CONFIG.MIN_ROUNDS} and ${CONFIG.MAX_ROUNDS}.`);
    }

    let roomCode = this.generateRoomCode();
    // Ensure uniqueness
    while (this.roomRepo.getRoomByCode(roomCode)) {
      roomCode = this.generateRoomCode();
    }

    const hostId = uuidv4();
    const sessionToken = uuidv4();

    const room = this.roomRepo.createRoom(roomCode, hostId, totalRounds, discussionDuration, gameMode, clipDuration);
    const host = this.playerRepo.createPlayer(hostId, roomCode, trimmedNick, sessionToken, true);

    return { room, host, sessionToken };
  }

  joinRoom(
    roomCode: string,
    nickname: string
  ): { room: Room; player: Player; sessionToken: string } {
    const cleanCode = roomCode.trim().toUpperCase();
    const trimmedNick = nickname.trim();

    if (!trimmedNick || trimmedNick.length < 2 || trimmedNick.length > 20) {
      throw new Error('Nickname must be between 2 and 20 characters.');
    }

    const room = this.roomRepo.getRoomByCode(cleanCode);
    if (!room) {
      throw new Error(`Room with code "${cleanCode}" was not found.`);
    }

    if (room.status !== 'lobby') {
      throw new Error('Cannot join: This game is already in progress or finished.');
    }

    const currentCount = this.playerRepo.countPlayersInRoom(cleanCode);
    if (currentCount >= CONFIG.MAX_PLAYERS_PER_ROOM) {
      throw new Error(`Room is full (maximum ${CONFIG.MAX_PLAYERS_PER_ROOM} players).`);
    }

    // Check if nickname already taken in room
    const existingPlayers = this.playerRepo.getPlayersInRoom(cleanCode);
    const nickExists = existingPlayers.some(
      (p) => p.nickname.toLowerCase() === trimmedNick.toLowerCase()
    );
    let finalNick = trimmedNick;
    if (nickExists) {
      finalNick = `${trimmedNick} (${currentCount + 1})`;
    }

    const playerId = uuidv4();
    const sessionToken = uuidv4();

    const player = this.playerRepo.createPlayer(playerId, cleanCode, finalNick, sessionToken, false);

    return { room, player, sessionToken };
  }

  authenticateSession(sessionToken: string): { player: Player; room: Room } | null {
    if (!sessionToken) return null;
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) return null;

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) return null;

    return { player, room };
  }

  setPlayerReady(sessionToken: string, isReady: boolean): { player: Player; players: PublicPlayer[] } {
    const auth = this.authenticateSession(sessionToken);
    if (!auth) throw new Error('Invalid session.');

    this.playerRepo.setPlayerReady(auth.player.id, isReady);
    const updated = this.playerRepo.getPlayerById(auth.player.id)!;
    const players = this.playerRepo.getPublicPlayersInRoom(auth.room.code);

    return { player: updated, players };
  }

  updateRoomSettings(
    sessionToken: string,
    totalRounds: number,
    discussionDuration: number,
    gameMode?: GameMode,
    clipDuration?: number
  ): { room: Room } {
    const auth = this.authenticateSession(sessionToken);
    if (!auth) throw new Error('Invalid session.');
    if (!auth.player.is_host) throw new Error('Only the room leader can update settings.');
    if (auth.room.status !== 'lobby') throw new Error('Cannot change settings after game has started.');

    if (totalRounds < CONFIG.MIN_ROUNDS || totalRounds > CONFIG.MAX_ROUNDS) {
      throw new Error(`Rounds must be between ${CONFIG.MIN_ROUNDS} and ${CONFIG.MAX_ROUNDS}.`);
    }

    if (![15, 30, 45, 60, 120, 180, 300].includes(discussionDuration)) {
      throw new Error('Discussion duration must be 15, 30, 45, 60, 120, 180, or 300 seconds.');
    }

    if (clipDuration !== undefined && ![15, 30, 45, 60].includes(clipDuration)) {
      throw new Error('Clip duration must be 15, 30, 45, or 60 seconds.');
    }

    if (gameMode !== undefined && !['who_added', 'guess_song'].includes(gameMode)) {
      throw new Error("Game mode must be either 'who_added' or 'guess_song'.");
    }

    this.roomRepo.updateRoomSettings(auth.room.code, totalRounds, discussionDuration, gameMode, clipDuration);
    const updatedRoom = this.roomRepo.getRoomByCode(auth.room.code)!;
    return { room: updatedRoom };
  }

  handlePlayerDisconnect(playerId: string): { roomCode: string; players: PublicPlayer[] } | null {
    const player = this.playerRepo.getPlayerById(playerId);
    if (!player) return null;

    this.playerRepo.updatePlayerConnection(playerId, false, null);
    const players = this.playerRepo.getPublicPlayersInRoom(player.room_code);

    return { roomCode: player.room_code, players };
  }

  handlePlayerReconnect(sessionToken: string, socketId: string): { player: Player; room: Room; players: PublicPlayer[] } | null {
    const auth = this.authenticateSession(sessionToken);
    if (!auth) return null;

    this.playerRepo.updatePlayerConnection(auth.player.id, true, socketId);
    const updatedPlayer = this.playerRepo.getPlayerById(auth.player.id)!;
    const players = this.playerRepo.getPublicPlayersInRoom(auth.room.code);

    return { player: updatedPlayer, room: auth.room, players };
  }
}
