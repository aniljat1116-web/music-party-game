import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Validates YouTube URL or raw ID and extracts the 11-char video ID.
 */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // If already an 11-character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split(/[?#&/]/)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live', 'v'].includes(pathParts[0]) && pathParts[1]) {
        const id = pathParts[1].split(/[?#&/]/)[0];
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
  } catch (e) {
    // Regex fallback
    const match = trimmed.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }

  return null;
}

export function isValidYouTubeUrl(url: string | null | undefined): boolean {
  return !!extractYouTubeId(url);
}

/**
 * Sanitize filename for safe filesystem storage (removes illegal characters and path separators).
 */
export function sanitizeFilename(name: string, ext = 'm4a'): string {
  if (!name) name = 'audio';
  // Strip path traversal and illegal characters: < > : " / \ | ? *
  let safe = name
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (safe.length > 100) safe = safe.slice(0, 100).trim();
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  return `${safe}.${cleanExt}`;
}

/**
 * Format bytes to human readable string (KB, MB, GB).
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Recursively scans a Puppeteer cache directory for installed Chrome/Chromium binaries.
 */
function findChromeInPuppeteerDir(baseDir: string): string | null {
  try {
    if (!fs.existsSync(baseDir)) return null;
    const chromeDir = path.join(baseDir, 'chrome');
    if (!fs.existsSync(chromeDir)) return null;
    const entries = fs.readdirSync(chromeDir);
    for (const entry of entries) {
      const entryPath = path.join(chromeDir, entry);
      if (!fs.statSync(entryPath).isDirectory()) continue;
      const candidates = [
        path.join(entryPath, 'chrome-linux64', 'chrome'),
        path.join(entryPath, 'chrome-linux', 'chrome'),
        path.join(entryPath, 'chrome-win64', 'chrome.exe'),
        path.join(entryPath, 'chrome-win32', 'chrome.exe'),
        path.join(entryPath, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(entryPath, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(entryPath, 'chrome'),
        path.join(entryPath, 'chrome.exe')
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // Ignore read or permission errors
  }
  return null;
}

/**
 * Locate Chrome or Edge executable cross-platform (Linux / Windows / macOS),
 * supporting Puppeteer cache, Render deployment paths, and environment overrides.
 */
export function findBrowserExecutable(): string | null {
  // 1. Support standard environment variables first (useful in CI / custom Render settings)
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  // 2. Search Puppeteer cache locations (including local project cache and Render container paths)
  const puppeteerCacheDirs = [
    process.env.PUPPETEER_CACHE_DIR,
    path.resolve(process.cwd(), '.cache', 'puppeteer'),
    path.join(os.homedir(), '.cache', 'puppeteer'),
    '/opt/render/project/src/.cache/puppeteer',
    '/opt/render/.cache/puppeteer',
    '/opt/render/project/.cache/puppeteer'
  ].filter(Boolean) as string[];

  for (const dir of puppeteerCacheDirs) {
    const foundInCache = findChromeInPuppeteerDir(dir);
    if (foundInCache) {
      return foundInCache;
    }
  }

  // 3. Linux standard paths (for deployment on Linux hosts / Render native environment)
  const linuxStandardPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/bin/msedge',
    '/usr/bin/microsoft-edge'
  ];

  for (const p of linuxStandardPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 4. Windows standard paths (for local development)
  const windowsCandidatePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];

  for (const p of windowsCandidatePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Asynchronously resolves a browser executable, trying static discovery first,
 * and falling back to Puppeteer's built-in resolution engine.
 */
export async function resolveBrowserExecutable(): Promise<string | null> {
  const staticPath = findBrowserExecutable();
  if (staticPath) return staticPath;

  try {
    const puppeteerModule = await import('puppeteer');
    const p = puppeteerModule.default || puppeteerModule;
    if (typeof p.executablePath === 'function') {
      const resolved = await p.executablePath();
      if (resolved && fs.existsSync(resolved)) {
        return resolved;
      }
    }
  } catch {
    // Puppeteer resolution fallback failed
  }

  return null;
}

/**
 * Get sanitized browser name for safe logging without leaking filesystem or credentials.
 */
export function getSanitizedBrowserName(browserPath: string | null): string {
  if (!browserPath) return 'unknown';
  const basename = path.basename(browserPath).toLowerCase();
  if (basename.includes('edge')) return 'Microsoft Edge';
  if (basename.includes('brave')) return 'Brave Browser';
  if (basename.includes('chromium')) return 'Chromium';
  if (basename.includes('chrome')) return 'Google Chrome';
  return basename;
}
