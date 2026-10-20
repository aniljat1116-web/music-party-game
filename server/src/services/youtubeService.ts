import ytSearch from 'yt-search';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
}

export class YouTubeService {
  /**
   * Search YouTube for videos matching the query.
   * Returns up to 5 results with videoId, title, thumbnail, and duration.
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
      // yt-search returns an object containing .videos array
      const searchFn: any = typeof ytSearch === 'function' ? ytSearch : (ytSearch as any).default;
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
