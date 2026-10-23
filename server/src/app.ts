import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { RoomService } from './services/roomService.js';
import { SongService } from './services/songService.js';
import { JamendoService } from './services/jamendoService.js';
import { YouTubeService } from './services/youtubeService.js';
import { MusicDownloadAgentService } from './services/musicDownloadAgentService.js';
import { createRoomRouter } from './routes/roomRoutes.js';
import { createAudioRouter } from './routes/audioRoutes.js';
import { createMusicRouter } from './routes/musicRoutes.js';
import { createSearchRouter } from './routes/searchRoutes.js';

export function createApp(
  roomService: RoomService,
  songService: SongService,
  jamendoService?: JamendoService,
  youtubeService?: YouTubeService,
  agentService?: MusicDownloadAgentService
): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api/rooms', createRoomRouter(roomService, songService));
  app.use('/api/rooms', createAudioRouter(songService, undefined, agentService));
  app.use('/api/music', createMusicRouter(jamendoService));
  app.use('/api/search', createSearchRouter(youtubeService));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    const downloaderStatus = agentService ? agentService.getBrowserStatus() : null;
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      downloader: downloaderStatus
        ? {
            available: downloaderStatus.available,
            checked: downloaderStatus.checked,
            browser: downloaderStatus.browserName,
            error: downloaderStatus.error
          }
        : undefined
    });
  });

  // Diagnostics endpoint for memory, queue, and process health (Requirement 6)
  app.get('/api/diagnostics', (req: Request, res: Response) => {
    const diagKey = process.env.DIAGNOSTIC_KEY;
    if (diagKey) {
      const authHeader = req.headers.authorization;
      const keyQuery = req.query.key;
      const isAuthorized = authHeader === `Bearer ${diagKey}` || keyQuery === diagKey;
      if (!isAuthorized) {
        return res.status(401).json({ success: false, error: 'Unauthorized diagnostic request.' });
      }
    }

    const diag = agentService ? agentService.getDiagnostics() : null;
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      diagnostics: diag
    });
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
