import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import { RoomService } from '../services/roomService.js';
import { SongService } from '../services/songService.js';
import { GameService } from '../services/gameService.js';
import { GameMode } from '../types/index.js';

interface AuthenticatedSocket extends Socket {
  sessionToken?: string;
  playerId?: string;
  roomCode?: string;
  nickname?: string;
}

export function setupSocketHandlers(
  io: Server,
  roomService: RoomService,
  songService: SongService,
  gameService: GameService
): void {
  // Broadcast personalized game state and personalized songs list to each connected player in a room
  const broadcastGameState = (roomCode: string) => {
    const roomUpper = roomCode.toUpperCase();
    const sockets = io.sockets.adapter.rooms.get(roomUpper);
    if (!sockets) return;

    for (const socketId of sockets) {
      const sock = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
      if (sock && sock.sessionToken) {
        const state = gameService.getGameStateForPlayer(sock.sessionToken);
        if (state) {
          sock.emit('game:state', state);
        }
      }
    }
  };

  const broadcastSongsList = (roomCode: string) => {
    const roomUpper = roomCode.toUpperCase();
    const sockets = io.sockets.adapter.rooms.get(roomUpper);
    if (!sockets) return;

    for (const socketId of sockets) {
      const sock = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
      if (sock) {
        const songs = songService.getRoomSongs(roomUpper, sock.playerId);
        sock.emit('room:songs_updated', songs);
      }
    }
  };

  // Wire gameService event callback to Socket.IO broadcasts
  gameService.setEventCallback((roomCode, eventName, data) => {
    const roomUpper = roomCode.toUpperCase();
    if (
      eventName === 'game:state_changed' ||
      eventName === 'room:returned_to_lobby' ||
      eventName === 'game:rematch_ready'
    ) {
      broadcastGameState(roomUpper);
      broadcastSongsList(roomUpper);
      if (eventName === 'game:rematch_ready') {
        io.to(roomUpper).emit('game:rematch_ready', data);
      }
    } else if (eventName === 'game:discussion_skip_update') {
      io.to(roomUpper).emit('game:discussion_skip_update', data);
      broadcastGameState(roomUpper);
    } else if (eventName === 'game:vote_cast') {
      io.to(roomUpper).emit('game:vote_cast', data);
    } else if (eventName === 'game:finished') {
      broadcastGameState(roomUpper);
      io.to(roomUpper).emit('game:finished', data);
    } else if (eventName === 'game:reaction') {
      io.to(roomUpper).emit('game:reaction', data);
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    // Join or Reconnect to Room
    socket.on('room:join', ({ sessionToken, roomCode }: { sessionToken: string; roomCode: string }) => {
      try {
        if (!sessionToken || !roomCode) {
          return socket.emit('error', { message: 'Session token and room code required.' });
        }

        const reconnect = roomService.handlePlayerReconnect(sessionToken, socket.id);
        if (!reconnect) {
          return socket.emit('error', { message: 'Invalid or expired session token.' });
        }

        const roomUpper = reconnect.room.code.toUpperCase();
        socket.sessionToken = sessionToken;
        socket.playerId = reconnect.player.id;
        socket.roomCode = roomUpper;
        socket.nickname = reconnect.player.nickname;

        socket.join(roomUpper);

        // Send current player data & public lists
        socket.emit('room:joined', {
          player: {
            id: reconnect.player.id,
            nickname: reconnect.player.nickname,
            is_host: Boolean(reconnect.player.is_host),
            is_ready: Boolean(reconnect.player.is_ready),
            score: reconnect.player.score,
            connected: true
          },
          room: reconnect.room
        });

        // Broadcast updated players list to room
        io.to(roomUpper).emit('room:players_updated', reconnect.players);

        // Send player-safe songs list
        const songs = songService.getRoomSongs(roomUpper, reconnect.player.id);
        socket.emit('room:songs_updated', songs);

        // Send chat history
        const messages = gameService.getGameRepo().getRecentChatMessages(roomUpper);
        socket.emit('chat:history', messages);

        // Send personalized game state
        const state = gameService.getGameStateForPlayer(sessionToken);
        if (state) {
          socket.emit('game:state', state);
        }
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Toggle player ready status
    socket.on('room:toggle_ready', ({ isReady }: { isReady: boolean }) => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        const res = roomService.setPlayerReady(socket.sessionToken, Boolean(isReady));
        io.to(socket.roomCode).emit('room:players_updated', res.players);
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Update room settings (host only)
    socket.on(
      'room:update_settings',
      ({
        totalRounds,
        discussionDuration,
        gameMode,
        clipDuration
      }: {
        totalRounds: number;
        discussionDuration: number;
        gameMode?: GameMode;
        clipDuration?: number;
      }) => {
        try {
          if (!socket.sessionToken || !socket.roomCode) return;
          const res = roomService.updateRoomSettings(
            socket.sessionToken,
            totalRounds,
            discussionDuration,
            gameMode,
            clipDuration
          );
          io.to(socket.roomCode).emit('room:settings_updated', {
            total_rounds: res.room.total_rounds,
            discussion_duration: res.room.discussion_duration,
            game_mode: res.room.game_mode,
            clip_duration: res.room.clip_duration
          });
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      }
    );

    // Refresh songs list for room (e.g. after upload/delete)
    socket.on('room:refresh_songs', () => {
      if (!socket.roomCode) return;
      broadcastSongsList(socket.roomCode);
    });

    // Start game (host only)
    socket.on('game:start', () => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        gameService.startGame(socket.sessionToken);
        broadcastGameState(socket.roomCode);
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Toggle skip discussion readiness
    socket.on('game:skip_discussion', ({ roundId }: { roundId: string }) => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        const res = gameService.toggleDiscussionSkip(socket.sessionToken, roundId);
        if (!res.success) {
          socket.emit('error', { message: res.error || 'Failed to toggle discussion readiness.' });
        } else {
          broadcastGameState(socket.roomCode);
        }
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Submit private vote ("Who Added This Song" mode)
    socket.on('game:vote', ({ roundId, votedPlayerId }: { roundId: string; votedPlayerId: string }) => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        const res = gameService.submitVote(socket.sessionToken, roundId, votedPlayerId);
        if (!res.success) {
          socket.emit('error', { message: res.error || 'Vote submission failed.' });
        } else {
          broadcastGameState(socket.roomCode);
        }
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Submit private guess ("Guess the Song" mode)
    socket.on(
      'game:guess',
      ({
        roundId,
        guessTitle,
        guessArtist
      }: {
        roundId: string;
        guessTitle: string;
        guessArtist?: string;
      }) => {
        try {
          if (!socket.sessionToken || !socket.roomCode) return;
          const res = gameService.submitGuess(socket.sessionToken, roundId, guessTitle, guessArtist);
          if (!res.success) {
            socket.emit('error', { message: res.error || 'Guess submission failed.' });
          } else {
            broadcastGameState(socket.roomCode);
          }
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      }
    );

    // Skip voting (abstention)
    socket.on('game:skip_vote', ({ roundId }: { roundId: string }) => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        const res = gameService.skipVote(socket.sessionToken, roundId);
        if (!res.success) {
          socket.emit('error', { message: res.error || 'Failed to skip vote.' });
        } else {
          broadcastGameState(socket.roomCode);
        }
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Emoji reaction
    socket.on('game:reaction', ({ emoji }: { emoji: string }) => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        gameService.submitReaction(socket.sessionToken, emoji);
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Rematch (host only)
    socket.on('game:rematch', () => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        gameService.rematch(socket.sessionToken);
        broadcastGameState(socket.roomCode);
        broadcastSongsList(socket.roomCode);
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Return to lobby after final results (host only)
    socket.on('game:return_to_lobby', () => {
      try {
        if (!socket.sessionToken || !socket.roomCode) return;
        gameService.returnToLobby(socket.sessionToken);
        broadcastGameState(socket.roomCode);
        broadcastSongsList(socket.roomCode);
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // In-game text chat
    socket.on('chat:send', ({ message }: { message: string }) => {
      try {
        if (!socket.sessionToken || !socket.roomCode || !socket.playerId || !socket.nickname) return;
        const text = (message || '').trim();
        if (!text) return;
        if (text.length > CONFIG.MAX_CHAT_MESSAGE_LENGTH) {
          return socket.emit('error', {
            message: `Message exceeds ${CONFIG.MAX_CHAT_MESSAGE_LENGTH} character limit.`
          });
        }

        const msgId = uuidv4();
        const chatMsg = gameService
          .getGameRepo()
          .addChatMessage(msgId, socket.roomCode, socket.playerId, socket.nickname, text);

        io.to(socket.roomCode).emit('chat:new_message', chatMsg);
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      if (socket.playerId && socket.roomCode) {
        const result = roomService.handlePlayerDisconnect(socket.playerId);
        if (result) {
          io.to(result.roomCode).emit('room:players_updated', result.players);
          io.to(result.roomCode).emit('player:disconnected', {
            playerId: socket.playerId,
            nickname: socket.nickname
          });
          // Re-evaluate active phase readiness so disconnected player doesn't stall the room
          gameService.handlePlayerDisconnectCheck(result.roomCode);
          broadcastGameState(result.roomCode);
        }
      }
    });
  });
}
