import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_PATH: process.env.DB_PATH || path.resolve(process.cwd(), 'database.sqlite'),
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads'),
  MAX_PLAYERS_PER_ROOM: 10,
  MIN_PLAYERS_TO_START: 3,
  MAX_SONGS_PER_PLAYER: 3,
  MAX_FILE_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
  ALLOWED_EXTENSIONS: ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
  ALLOWED_MIME_TYPES: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/vorbis',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac'
  ],
  DEFAULT_DISCUSSION_SECONDS: 300, // Exactly 5 minutes (05:00) by default
  VOTING_SECONDS: 300,             // Exactly 5 minutes (05:00) by default
  REVEAL_SECONDS: 10,
  PLAYBACK_BUFFER_SECONDS: 2,
  MAX_CHAT_MESSAGE_LENGTH: 200,
  MIN_ROUNDS: 3,
  MAX_ROUNDS: 20,
  JAMENDO_CLIENT_ID: process.env.JAMENDO_CLIENT_ID || '',
  JAMENDO_API_BASE: 'https://api.jamendo.com/v3.0',
  AGENT_DOWNLOAD_TIMEOUT_MS: parseInt(process.env.AGENT_DOWNLOAD_TIMEOUT_MS || '90000', 10),
  AGENT_TEMP_DIR: process.env.AGENT_TEMP_DIR || path.resolve(process.cwd(), 'uploads', '.agent_temp'),
  YT_AI_SERVICE_URL: (() => {
    const raw = (process.env.YT_AI_SERVICE_URL || 'https://tools.ruvs.in').trim().replace(/\/+$/, '');
    if (!raw || raw === 'https://ruvs.in' || raw === 'http://ruvs.in' || raw.includes('melamrahul.github.io')) {
      return 'https://tools.ruvs.in';
    }
    return raw;
  })()
};
