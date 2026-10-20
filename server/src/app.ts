import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { RoomService } from './services/roomService.js';
import { SongService } from './services/songService.js';
import { JamendoService } from './services/jamendoService.js';
import { YouTubeService } from './services/youtubeService.js';
import { createRoomRouter } from './routes/roomRoutes.js';
import { createAudioRouter } from './routes/audioRoutes.js';
import { createMusicRouter } from './routes/musicRoutes.js';
import { createSearchRouter } from './routes/searchRoutes.js';

export function createApp(
  roomService: RoomService,
  songService: SongService,
  jamendoService?: JamendoService,
  youtubeService?: YouTubeService
): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api/rooms', createRoomRouter(roomService, songService));
  app.use('/api/rooms', createAudioRouter(songService));
  app.use('/api/music', createMusicRouter(jamendoService));
  app.use('/api/search', createSearchRouter(youtubeService));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Serve production client build if available
  const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(clientDistPath, 'index.html'));
      }
      next();
    });
  }

  // Generic error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  });

  return app;
}
