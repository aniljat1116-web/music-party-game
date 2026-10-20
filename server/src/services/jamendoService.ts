import { CONFIG } from '../config.js';
import { JamendoTrackResult } from '../types/index.js';

export interface JamendoSearchResponse {
  success: boolean;
  tracks: JamendoTrackResult[];
  total_count: number;
  offset: number;
  limit: number;
  error?: string;
  isConfigured?: boolean;
}

export class JamendoService {
  private clientId: string;
  private apiBase: string;

  constructor(clientId = CONFIG.JAMENDO_CLIENT_ID, apiBase = CONFIG.JAMENDO_API_BASE) {
    this.clientId = clientId;
    this.apiBase = apiBase;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientId.trim().length > 0);
  }

  /**
   * Searches Jamendo catalog for tracks matching query string.
   */
  async searchTracks(
    query: string,
    limit = 10,
    offset = 0
  ): Promise<JamendoSearchResponse> {
    const trimmedQuery = (query || '').trim();
    const safeLimit = Math.min(20, Math.max(1, limit));
    const safeOffset = Math.max(0, offset);

    if (!trimmedQuery) {
      return {
        success: true,
        tracks: [],
        total_count: 0,
        offset: safeOffset,
        limit: safeLimit,
        isConfigured: this.isConfigured()
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        tracks: [],
        total_count: 0,
        offset: safeOffset,
        limit: safeLimit,
        isConfigured: false,
        error: 'Jamendo Client ID is not configured. Set JAMENDO_CLIENT_ID in your server environment to enable music search.'
      };
    }

    const url = new URL(`${this.apiBase}/tracks/`);
    url.searchParams.set('client_id', this.clientId.trim());
    url.searchParams.set('format', 'json');
    url.searchParams.set('search', trimmedQuery);
    url.searchParams.set('limit', String(safeLimit));
    url.searchParams.set('offset', String(safeOffset));
    url.searchParams.set('audioformat', 'mp32');
    url.searchParams.set('imagesize', '200');
    url.searchParams.set('include', 'musicinfo');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MusicPartyGame/2.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          tracks: [],
          total_count: 0,
          offset: safeOffset,
          limit: safeLimit,
          isConfigured: true,
          error: `Jamendo service responded with HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data: any = await response.json();

      if (!data || !data.headers) {
        return {
          success: false,
          tracks: [],
          total_count: 0,
          offset: safeOffset,
          limit: safeLimit,
          isConfigured: true,
          error: 'Invalid response received from Jamendo API.'
        };
      }

      // Check Jamendo header status & code
      if (data.headers.status === 'failed') {
        let errorMsg = data.headers.error_message || 'Search failed';
        if (data.headers.code === 4 || data.headers.code === 5) {
          errorMsg = 'Invalid Jamendo Client ID. Please verify your JAMENDO_CLIENT_ID configuration.';
        } else if (data.headers.code === 6) {
          errorMsg = 'Jamendo API rate limit exceeded. Please wait a moment before searching again.';
        }

        return {
          success: false,
          tracks: [],
          total_count: 0,
          offset: safeOffset,
          limit: safeLimit,
          isConfigured: true,
          error: errorMsg
        };
      }

      const results = Array.isArray(data.results) ? data.results : [];
      const tracks: JamendoTrackResult[] = results
        .filter((t: any) => t && t.id && t.name)
        .map((t: any) => {
          const audioUrl = typeof t.audio === 'string' && t.audio.startsWith('http') ? t.audio : '';
          const hasPlayableAudio = Boolean(audioUrl);
          const rawDuration = typeof t.duration === 'number' ? Math.round(t.duration) : 30;

          return {
            id: String(t.id),
            title: String(t.name).trim() || 'Untitled Track',
            artist: String(t.artist_name || 'Unknown Artist').trim(),
            duration: Math.max(5, rawDuration),
            artwork_url: t.album_image || t.image || null,
            audio_url: audioUrl,
            playable: hasPlayableAudio,
            license_ccurl: typeof t.license_ccurl === 'string' ? t.license_ccurl : undefined
          };
        });

      return {
        success: true,
        tracks,
        total_count: typeof data.headers.results_count === 'number' ? data.headers.results_count : tracks.length,
        offset: safeOffset,
        limit: safeLimit,
        isConfigured: true
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          tracks: [],
          total_count: 0,
          offset: safeOffset,
          limit: safeLimit,
          isConfigured: true,
          error: 'Search request timed out. Jamendo API is currently slow or unreachable.'
        };
      }

      return {
        success: false,
        tracks: [],
        total_count: 0,
        offset: safeOffset,
        limit: safeLimit,
        isConfigured: true,
        error: err.message || 'Network error while contacting Jamendo API.'
      };
    }
  }
}
