import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { Readable } from 'stream';
import { CONFIG } from '../config.js';
import { SongService } from '../services/songService.js';
import { PlayerRepo } from '../db/repositories/playerRepo.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE_BYTES
  }
});

const uploadLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: 'Too many song additions. Please wait a minute before adding more tracks.'
});

export function createAudioRouter(songService: SongService, playerRepo?: PlayerRepo): Router {
  const router = Router();
  const players = playerRepo || new PlayerRepo();

  // Upload a local audio file
  router.post('/:roomCode/songs', uploadLimiter, upload.single('audio'), (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.body.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'Session token required for upload.' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No audio file provided in request.' });
      }

      // Default duration: 30s for round party play if not client supplied
      let estimatedDuration = 30;
      if (req.body.duration) {
        const parsed = parseFloat(req.body.duration);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 300) {
          estimatedDuration = Math.round(parsed);
        }
      }

      const title = req.body.title ? String(req.body.title).trim() : undefined;
      const artist = req.body.artist ? String(req.body.artist).trim() : undefined;

      const song = songService.saveSongFile(
        token,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        estimatedDuration,
        title,
        artist
      );

      res.status(201).json({
        success: true,
        song: {
          id: song.id,
          original_filename: song.original_filename,
          title: song.title || song.original_filename,
          artist: song.artist || null,
          file_size: song.file_size,
          source_type: song.source_type,
          duration_seconds: song.duration_seconds,
          uploader_player_id: song.uploader_player_id
        }
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Add a Jamendo catalog track to the room queue
  router.post('/:roomCode/songs/jamendo', uploadLimiter, (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.body.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'Session token required to add Jamendo track.' });
      }

      const { trackId, title, artist, duration, audioUrl, artworkUrl } = req.body;
      if (!trackId || !title || !audioUrl) {
        return res.status(400).json({
          success: false,
          error: 'Missing required Jamendo track details (trackId, title, audioUrl).'
        });
      }

      const song = songService.addJamendoSong(token, {
        trackId: String(trackId),
        title: String(title),
        artist: String(artist || 'Unknown Artist'),
        duration: Number(duration) || 30,
        audioUrl: String(audioUrl),
        artworkUrl: artworkUrl ? String(artworkUrl) : null
      });

      res.status(201).json({
        success: true,
        song: {
          id: song.id,
          original_filename: song.original_filename,
          title: song.title || song.original_filename,
          artist: song.artist || null,
          file_size: song.file_size,
          source_type: song.source_type,
          artwork_url: song.artwork_url,
          duration_seconds: song.duration_seconds,
          uploader_player_id: song.uploader_player_id
        }
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Add a YouTube video track to the room queue
  router.post('/:roomCode/songs/youtube', uploadLimiter, (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.body.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'Session token required to add YouTube track.' });
      }

      const { videoId, title, duration, thumbnail } = req.body;
      if (!videoId || !title) {
        return res.status(400).json({
          success: false,
          error: 'Missing required YouTube details (videoId, title).'
        });
      }

      const song = songService.addYouTubeSong(token, {
        videoId: String(videoId),
        title: String(title),
        duration: duration,
        thumbnail: thumbnail ? String(thumbnail) : null
      });

      res.status(201).json({
        success: true,
        song: {
          id: song.id,
          original_filename: song.original_filename,
          title: song.title || song.original_filename,
          artist: song.artist || null,
          file_size: song.file_size,
          source_type: song.source_type,
          artwork_url: song.artwork_url,
          duration_seconds: song.duration_seconds,
          uploader_player_id: song.uploader_player_id
        }
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Delete a song
  router.delete('/:roomCode/songs/:songId', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.query.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'Session token required.' });
      }

      songService.deleteSong(token, String(req.params.songId));
      res.json({ success: true, message: 'Song deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // List songs in room (sanitized according to requester)
  router.get('/:roomCode/songs', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.query.token as string);

      let requesterId: string | undefined;
      if (token) {
        const p = players.getPlayerByToken(token);
        if (p) requesterId = p.id;
      }

      const songs = songService.getRoomSongs(String(req.params.roomCode), requesterId);
      res.json({ success: true, songs });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Securely stream song audio for authorized players in this room
  router.get('/:roomCode/audio/:songId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.query.token as string);

      if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Session token required.' });
      }

      const playbackInfo = songService.getSongForPlayback(
        token,
        String(req.params.roomCode),
        String(req.params.songId)
      );

      if (playbackInfo.isExternal && playbackInfo.externalUrl) {
        // Stream from Jamendo CDN
        const upstreamHeaders: Record<string, string> = {
          'User-Agent': 'MusicPartyGame/2.0'
        };
        if (req.headers.range) {
          upstreamHeaders['Range'] = req.headers.range;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        try {
          const upstream = await fetch(playbackInfo.externalUrl, {
            headers: upstreamHeaders,
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (!upstream.ok && upstream.status !== 206) {
            return res.status(502).json({
              success: false,
              error: `Jamendo stream unavailable (HTTP ${upstream.status}).`
            });
          }

          const resHeaders: Record<string, string> = {
            'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
          };

          const contentLength = upstream.headers.get('content-length');
          if (contentLength) resHeaders['Content-Length'] = contentLength;

          const contentRange = upstream.headers.get('content-range');
          if (contentRange) resHeaders['Content-Range'] = contentRange;

          res.writeHead(upstream.status, resHeaders);

          if (!upstream.body) {
            return res.end();
          }

          const nodeStream = Readable.fromWeb(upstream.body as any);
          nodeStream.pipe(res);
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          return res.status(502).json({
            success: false,
            error: 'Failed to connect to Jamendo streaming server.'
          });
        }
      } else if (playbackInfo.filePath) {
        // Local uploaded file streaming
        const stat = fs.statSync(playbackInfo.filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          // HTTP 206 Partial Content support for HTML5 Audio
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          const fileStream = fs.createReadStream(playbackInfo.filePath, { start, end });

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': playbackInfo.mimeType,
            'Access-Control-Allow-Origin': '*'
          });
          fileStream.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': playbackInfo.mimeType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
          });
          fs.createReadStream(playbackInfo.filePath).pipe(res);
        }
      }
    } catch (err: any) {
      res.status(403).json({ success: false, error: err.message });
    }
  });

  return router;
}
