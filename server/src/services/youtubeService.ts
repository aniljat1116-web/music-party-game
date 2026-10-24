import ytSearch from 'yt-search';
import { extractYouTubeId } from './agentUtils.js';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
}

export class YouTubeService {
  /**
   * Search YouTube for videos matching the query.
   * If a YouTube URL or 11-char video ID is passed, returns that direct video.
   * Otherwise returns up to 5 keyword search results with videoId, title, thumbnail, and duration.
   */
  async search(query: string, maxResults = 5): Promise<YouTubeSearchResult[]> {
    const trimmed = (query || '').trim();

    if (!trimmed) {
      throw new Error('Search query cannot be empty.');
    }

    if (trimmed.length > 200) {
      throw new Error('Search query is too long (maximum 200 characters).');
    }

    try {
      const searchFn: any = typeof ytSearch === 'function' ? ytSearch : (ytSearch as any).default;
      const extractedId = extractYouTubeId(trimmed);

      // If user pasted a YouTube URL or direct video ID, look up the exact video first
      if (extractedId) {
        try {
          const directVideo = await searchFn({ videoId: extractedId });
          if (directVideo && (directVideo.title || directVideo.videoId)) {
            let durationStr = '0:00';
            if (directVideo.timestamp) {
              durationStr = String(directVideo.timestamp);
            } else if (directVideo.duration && directVideo.duration.timestamp) {
              durationStr = String(directVideo.duration.timestamp);
            } else if (typeof directVideo.seconds === 'number' && directVideo.seconds > 0) {
              const mins = Math.floor(directVideo.seconds / 60);
              const secs = directVideo.seconds % 60;
              durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
            }

            return [
              {
                videoId: extractedId,
                title: String(directVideo.title || `YouTube Track ${extractedId}`).trim(),
                thumbnail: String(
                  directVideo.thumbnail ||
                    directVideo.image ||
                    `https://i.ytimg.com/vi/${extractedId}/hqdefault.jpg`
                ),
                duration: durationStr
              }
            ];
          }
        } catch {
          // If direct ID lookup fails, continue to standard keyword search
        }
      }

      // yt-search returns an object containing .videos array
      const searchResult = await searchFn(trimmed);

      if (!searchResult || !Array.isArray(searchResult.videos)) {
        return [];
      }

      // Filter and map only video results (up to maxResults)
      const videos = searchResult.videos
        .filter((v: any) => v && v.videoId && v.title)
        .slice(0, maxResults);

      return videos.map((v: any) => {
        // Format duration timestamp or fallback
        let durationStr = '0:00';
        if (v.timestamp) {
          durationStr = String(v.timestamp);
        } else if (v.duration && v.duration.timestamp) {
          durationStr = String(v.duration.timestamp);
        } else if (typeof v.seconds === 'number' && v.seconds > 0) {
          const mins = Math.floor(v.seconds / 60);
          const secs = v.seconds % 60;
          durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        return {
          videoId: String(v.videoId).trim(),
          title: String(v.title).trim(),
          thumbnail: String(v.thumbnail || v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`),
          duration: durationStr
        };
      });
    } catch (err: any) {
      // Never leak stack traces or internal search details
      console.error('YouTube search error:', err?.message || err);
      throw new Error('Failed to retrieve search results from YouTube. Please try another query.');
    }
  }
}
