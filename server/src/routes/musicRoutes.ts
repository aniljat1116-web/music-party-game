import { Router, Request, Response } from 'express';
import { JamendoService } from '../services/jamendoService.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const searchLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 40,
  message: 'Search rate limit reached. Please wait a moment before searching again.'
});

export function createMusicRouter(jamendoService?: JamendoService): Router {
  const router = Router();
  const jamendo = jamendoService || new JamendoService();

  // Status check for Jamendo API configuration
  router.get('/jamendo/status', (_req: Request, res: Response) => {
    res.json({
      success: true,
      configured: jamendo.isConfigured()
    });
  });

  // Search tracks from Jamendo catalog
  router.get('/jamendo/search', searchLimiter, async (req: Request, res: Response) => {
    try {
      const query = String(req.query.q || req.query.query || '').trim();
      const limit = parseInt(String(req.query.limit || '10'), 10) || 10;
      const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

      if (!query) {
        return res.json({
          success: true,
          tracks: [],
          total_count: 0,
          offset,
          limit,
          isConfigured: jamendo.isConfigured()
        });
      }

      const result = await jamendo.searchTracks(query, limit, offset);

      if (!result.success) {
        return res.status(result.isConfigured ? 400 : 503).json(result);
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        tracks: [],
        total_count: 0,
        error: err.message || 'Internal server error while searching music.'
      });
    }
  });

  return router;
}
