import { Router, Request, Response } from 'express';
import { RoomService } from '../services/roomService.js';
import { SongService } from '../services/songService.js';

export function createRoomRouter(roomService: RoomService, songService: SongService): Router {
  const router = Router();

  // Create room
  router.post('/', (req: Request, res: Response) => {
    try {
      const { nickname, discussionDuration, totalRounds, gameMode, clipDuration } = req.body;
      const result = roomService.createRoom(
        nickname,
        discussionDuration ? parseInt(discussionDuration, 10) : undefined,
        totalRounds ? parseInt(totalRounds, 10) : undefined,
        gameMode,
        clipDuration ? parseInt(clipDuration, 10) : undefined
      );

      res.status(201).json({
        success: true,
        room: result.room,
        player: {
          id: result.host.id,
          nickname: result.host.nickname,
          is_host: Boolean(result.host.is_host),
          is_ready: Boolean(result.host.is_ready),
          score: result.host.score,
          connected: Boolean(result.host.connected)
        },
        sessionToken: result.sessionToken
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Join room
  router.post('/join', (req: Request, res: Response) => {
    try {
      const { roomCode, nickname } = req.body;
      const result = roomService.joinRoom(roomCode, nickname);

      res.status(200).json({
        success: true,
        room: result.room,
        player: {
          id: result.player.id,
          nickname: result.player.nickname,
          is_host: Boolean(result.player.is_host),
          is_ready: Boolean(result.player.is_ready),
          score: result.player.score,
          connected: Boolean(result.player.connected)
        },
        sessionToken: result.sessionToken
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Validate session & get current room status
  router.get('/:roomCode/session', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.query.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'No session token provided.' });
      }

      const auth = roomService.authenticateSession(token);
      if (!auth) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session token.' });
      }

      if (auth.room.code.toUpperCase() !== String(req.params.roomCode).toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Session does not belong to this room.' });
      }

      const songs = songService.getRoomSongs(auth.room.code, auth.player.id);

      res.json({
        success: true,
        player: {
          id: auth.player.id,
          nickname: auth.player.nickname,
          is_host: Boolean(auth.player.is_host),
          is_ready: Boolean(auth.player.is_ready),
          score: auth.player.score,
          connected: Boolean(auth.player.connected)
        },
        room: auth.room,
        songs
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Update room settings (host only)
  router.post('/:roomCode/settings', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.body.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'No session token provided.' });
      }

      const { totalRounds, discussionDuration, gameMode, clipDuration } = req.body;
      const result = roomService.updateRoomSettings(
        token,
        parseInt(totalRounds, 10),
        parseInt(discussionDuration, 10),
        gameMode,
        clipDuration ? parseInt(clipDuration, 10) : undefined
      );

      res.json({ success: true, room: result.room });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
