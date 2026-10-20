import { Request, Response, NextFunction } from 'express';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

/**
 * Lightweight, in-memory sliding window rate limiter.
 * Automatically clears expired records to prevent memory leaks.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const records = new Map<string, ClientRecord>();

  // Cleanup sweep every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of records.entries()) {
      if (now >= record.resetTime) {
        records.delete(key);
      }
    }
  }, 120_000);

  // Unref interval so it does not keep node process alive in tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Identify client by session token or IP
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query.token as string) || (req.body?.token as string);

    const clientKey = token || req.ip || req.socket.remoteAddress || 'anonymous';
    const now = Date.now();

    let client = records.get(clientKey);
    if (!client || now >= client.resetTime) {
      client = {
        count: 1,
        resetTime: now + options.windowMs
      };
      records.set(clientKey, client);
      return next();
    }

    client.count++;
    if (client.count > options.max) {
      const retryAfterSeconds = Math.ceil((client.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        error: options.message,
        retryAfter: retryAfterSeconds
      });
    }

    next();
  };
}
