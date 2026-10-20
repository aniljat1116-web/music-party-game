import { Router, Request, Response } from 'express';
import { YouTubeService } from '../services/youtubeService.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const searchLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: 'Too many search requests. Please slow down.'
});

export function createSearchRouter(youtubeService?: YouTubeService): Router {
  const router = Router();
  const ytService = youtubeService || new YouTubeService();

  router.post('/', searchLimiter, async (req: Request, res: Response) => {
    try {
      const { query } = req.body || {};

      if (typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required and cannot be empty.'
        });
      }

      if (query.trim().length > 200) {
        return res.status(400).json({
          success: false,
          error: 'Search query is too long (maximum 200 characters).'
        });
      }

      const results = await ytService.search(query.trim(), 5);
      return res.json({
        success: true,
        results
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'YouTube search failed.'
      });
    }
  });

  return router;
}
