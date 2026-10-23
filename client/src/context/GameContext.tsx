import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  Player,
  Room,
  Song,
  GameStatePayload,
  ChatMessage,
  GameMode,
  ReactionEvent,
  ToastItem,
  ToastType,
  JamendoTrackResult,
  YouTubeSearchResult,
  AgentDownloadPhase
} from '../types';
import { saveSession, getSavedSession, clearSession } from '../utils/session';
import { isAudioUnlocked, unlockAudio } from '../utils/audioUnlock';

interface GameContextType {
  socket: Socket | null;
  connected: boolean;
  connecting: boolean;
  sessionToken: string | null;
  currentPlayer: Player | null;
  currentRoom: Room | null;
  players: Player[];
  songs: Song[];
  gameState: GameStatePayload | null;
  chatMessages: ChatMessage[];
  reactions: ReactionEvent[];
  toasts: ToastItem[];
  audioUnlocked: boolean;
  error: string | null;
  createRoom: (nickname: string, duration?: number, rounds?: number, gameMode?: GameMode, clipDuration?: number) => Promise<boolean>;
  joinRoom: (roomCode: string, nickname: string) => Promise<boolean>;
  leaveRoom: () => void;
  toggleReady: (isReady: boolean) => void;
  updateSettings: (totalRounds: number, duration: number, gameMode?: GameMode, clipDuration?: number) => void;
  uploadSong: (file: File, title?: string, artist?: string) => Promise<{ success: boolean; error?: string }>;
  searchJamendo: (query: string, limit?: number, offset?: number) => Promise<{ success: boolean; tracks?: JamendoTrackResult[]; total_count?: number; error?: string; isConfigured?: boolean }>;
  addJamendoSong: (track: JamendoTrackResult) => Promise<{ success: boolean; error?: string }>;
  searchYouTube: (query: string) => Promise<{ success: boolean; results?: YouTubeSearchResult[]; error?: string }>;
  addYouTubeSong: (video: { videoId: string; title: string; duration?: string; thumbnail?: string }) => Promise<{ success: boolean; error?: string }>;
  startAgentDownload: (
    url: string,
    onProgress?: (event: import('../types').AgentDownloadProgressEvent) => void
  ) => Promise<{ success: boolean; error?: string; song?: any; jobId?: string }>;
  deleteSong: (songId: string) => Promise<boolean>;
  startGame: () => void;
  submitVote: (votedPlayerId: string) => void;
  submitGuess: (guessTitle: string, guessArtist?: string) => void;
  toggleDiscussionSkip: () => void;
  skipVote: () => void;
  sendReaction: (emoji: string) => void;
  rematch: () => void;
  returnToLobby: () => void;
  sendChatMessage: (message: string) => void;
  handleUnlockAudio: () => Promise<void>;
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  clearError: () => void;
}

/**
 * Safely parses API responses to prevent `SyntaxError: Unexpected token '<'`
 * when a reverse proxy (e.g. Render/Cloudflare) or static SPA fallback returns an HTML error page.
 */
async function parseApiResponse<T = any>(
  res: Response,
  defaultError = 'Request failed'
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const contentType = res.headers.get('content-type') || '';

  // If response is not JSON (e.g. Render HTML 502/503/504 gateway page or SPA index.html)
  if (!contentType.includes('application/json')) {
    const rawText = await res.text().catch(() => '');
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        ok: false,
        status: res.status,
        error: `Server is waking up or temporarily unavailable (HTTP ${res.status}). Please wait a few seconds and try again.`
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        status: res.status,
        error: 'Requested service endpoint was not found (HTTP 404).'
      };
    }
    if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE')) {
      return {
        ok: false,
        status: res.status,
        error: `Server returned an HTML response instead of JSON (HTTP ${res.status}). The service may be starting up or restarting.`
      };
    }
    return {
      ok: false,
      status: res.status,
      error: rawText.slice(0, 120) || `${defaultError} (HTTP ${res.status})`
    };
  }

  try {
    const data = await res.json();
    if (!res.ok || (data && data.success === false)) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.error || data?.message || `${defaultError} (HTTP ${res.status})`
      };
    }
    return { ok: true, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: res.status,
      error: 'Received malformed JSON response from server. Please try again.'
    };
  }
}

const GameContext = createContext<GameContextType | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string | null>(() => getSavedSession().token);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(isAudioUnlocked());
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleUnlockAudio = useCallback(async () => {
    await unlockAudio();
    setAudioUnlocked(true);
    addToast('Audio enabled! You will now hear songs synchronously.', 'success');
  }, [addToast]);

  // Connect socket and register event listeners
  const initSocket = useCallback((token: string, roomCode: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setConnecting(true);
    const newSocket = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      newSocket.emit('room:join', { sessionToken: token, roomCode });
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      setConnected(false);
      setConnecting(false);
      console.warn('Socket connect error:', err.message);
    });

    newSocket.on('error', (data: { message: string }) => {
      setError(data.message);
      addToast(data.message, 'error');
    });

    newSocket.on('room:joined', (data: { player: Player; room: Room }) => {
      setCurrentPlayer(data.player);
      setCurrentRoom(data.room);
    });

    newSocket.on('room:players_updated', (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
      setCurrentPlayer((prev) => {
        if (!prev) return prev;
        const match = updatedPlayers.find((p) => p.id === prev.id);
        return match || prev;
      });
    });

    newSocket.on('player:disconnected', (data: { nickname: string }) => {
      addToast(`${data.nickname} disconnected from the room`, 'warning');
    });

    newSocket.on('room:songs_updated', (updatedSongs: Song[]) => {
      setSongs(updatedSongs);
    });

    newSocket.on(
      'room:settings_updated',
      (data: { total_rounds: number; discussion_duration: number; game_mode?: GameMode; clip_duration?: number }) => {
        setCurrentRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            total_rounds: data.total_rounds,
            discussion_duration: data.discussion_duration,
            game_mode: data.game_mode || prev.game_mode || 'who_added',
            clip_duration: data.clip_duration || prev.clip_duration || 30
          };
        });
        addToast('Game settings updated by host', 'info');
      }
    );

    newSocket.on('game:state', (state: GameStatePayload) => {
      setGameState(state);
      setCurrentRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: state.status,
          current_round: state.current_round,
          total_rounds: state.total_rounds,
          discussion_duration: state.discussion_duration,
          game_mode: state.game_mode,
          clip_duration: state.clip_duration
        };
      });
    });

    newSocket.on('game:discussion_skip_update', (data: { readyCount: number; totalEligible: number }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          discussion_skips_count: data.readyCount,
          total_discussion_eligible: data.totalEligible
        };
      });
    });

    newSocket.on('game:vote_cast', (data: { votesCount: number; totalEligible: number }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          votes_submitted_count: data.votesCount,
          total_eligible_voters: data.totalEligible
        };
      });
    });

    newSocket.on('game:reaction', (reaction: ReactionEvent) => {
      setReactions((prev) => [...prev, reaction]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 3000);
    });

    newSocket.on('game:rematch_ready', () => {
      addToast('Host started a rematch! Ready up for round 1!', 'success');
    });

    newSocket.on('game:finished', () => {
      addToast('Game Complete! Check out the final standings!', 'success');
    });

    newSocket.on('chat:history', (messages: ChatMessage[]) => {
      setChatMessages(messages);
    });

    newSocket.on('chat:new_message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });
  }, [addToast]);

  // Try auto-reconnect on mount if saved session exists
  useEffect(() => {
    const { token, roomCode } = getSavedSession();
    if (token && roomCode) {
      initSocket(token, roomCode);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [initSocket]);

  // Create Room
  const createRoom = async (
    nickname: string,
    duration = 300,
    rounds = 5,
    gameMode: GameMode = 'who_added',
    clipDuration = 30
  ): Promise<boolean> => {
    try {
      setError(null);
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          discussionDuration: duration,
          totalRounds: rounds,
          gameMode,
          clipDuration
        })
      });

      const parsed = await parseApiResponse<{
        success: boolean;
        sessionToken: string;
        room: Room;
        player: Player;
        error?: string;
      }>(res, 'Failed to create room.');

      if (!parsed.ok || !parsed.data?.success) {
        throw new Error(parsed.error || 'Failed to create room.');
      }

      const data = parsed.data;
      saveSession(data.sessionToken, data.room.code);
      setSessionToken(data.sessionToken);
      setCurrentPlayer(data.player);
      setCurrentRoom(data.room);

      initSocket(data.sessionToken, data.room.code);
      addToast(`Room ${data.room.code} created successfully!`, 'success');
      return true;
    } catch (err: any) {
      setError(err.message);
      addToast(err.message, 'error');
      return false;
    }
  };

  // Join Room
  const joinRoom = async (roomCode: string, nickname: string): Promise<boolean> => {
    try {
      setError(null);
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, nickname })
      });

      const parsed = await parseApiResponse<{
        success: boolean;
        sessionToken: string;
        room: Room;
        player: Player;
        error?: string;
      }>(res, 'Failed to join room.');

      if (!parsed.ok || !parsed.data?.success) {
        throw new Error(parsed.error || 'Failed to join room.');
      }

      const data = parsed.data;
      saveSession(data.sessionToken, data.room.code);
      setSessionToken(data.sessionToken);
      setCurrentPlayer(data.player);
      setCurrentRoom(data.room);

      initSocket(data.sessionToken, data.room.code);
      addToast(`Joined room ${data.room.code}!`, 'success');
      return true;
    } catch (err: any) {
      setError(err.message);
      addToast(err.message, 'error');
      return false;
    }
  };

  // Leave Room
  const leaveRoom = () => {
    clearSession();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
    setSessionToken(null);
    setCurrentPlayer(null);
    setCurrentRoom(null);
    setPlayers([]);
    setSongs([]);
    setGameState(null);
    setChatMessages([]);
    setReactions([]);
    addToast('You left the room.', 'info');
  };

  // Toggle Ready
  const toggleReady = (isReady: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('room:toggle_ready', { isReady });
    }
  };

  // Update Settings
  const updateSettings = (
    totalRounds: number,
    duration: number,
    gameMode?: GameMode,
    clipDuration?: number
  ) => {
    if (socketRef.current) {
      socketRef.current.emit('room:update_settings', {
        totalRounds,
        discussionDuration: duration,
        gameMode,
        clipDuration
      });
    }
  };

  // Upload Song
  const uploadSong = async (
    file: File,
    title?: string,
    artist?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!sessionToken || !currentRoom) {
      return { success: false, error: 'Not authenticated in room.' };
    }

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('token', sessionToken);
      if (title) formData.append('title', title);
      if (artist) formData.append('artist', artist);

      const res = await fetch(`/api/rooms/${currentRoom.code}/songs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`
        },
        body: formData
      });

      const parsed = await parseApiResponse<{ success: boolean; song: any; error?: string }>(
        res,
        'Upload failed.'
      );
      if (!parsed.ok || !parsed.data?.success) {
        return { success: false, error: parsed.error || 'Upload failed.' };
      }

      if (socketRef.current) {
        socketRef.current.emit('room:refresh_songs');
      }

      addToast(`"${parsed.data.song?.title || file.name}" uploaded successfully!`, 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during upload.' };
    }
  };

  // Search Jamendo Catalog
  const searchJamendo = async (
    query: string,
    limit = 10,
    offset = 0
  ): Promise<{ success: boolean; tracks?: JamendoTrackResult[]; total_count?: number; error?: string; isConfigured?: boolean }> => {
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        offset: String(offset)
      });
      const res = await fetch(`/api/music/jamendo/search?${params.toString()}`);
      const parsed = await parseApiResponse<{
        success: boolean;
        tracks?: JamendoTrackResult[];
        total_count?: number;
        error?: string;
        isConfigured?: boolean;
      }>(res, 'Failed to search Jamendo music.');

      if (!parsed.ok || !parsed.data) {
        return { success: false, error: parsed.error || 'Failed to search Jamendo music.' };
      }
      return parsed.data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to search Jamendo music.' };
    }
  };

  // Add Jamendo Track to Room
  const addJamendoSong = async (
    track: JamendoTrackResult
  ): Promise<{ success: boolean; error?: string }> => {
    if (!sessionToken || !currentRoom) {
      return { success: false, error: 'Not authenticated in room.' };
    }

    try {
      const res = await fetch(`/api/rooms/${currentRoom.code}/songs/jamendo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          duration: track.duration,
          audioUrl: track.audio_url,
          artworkUrl: track.artwork_url
        })
      });

      const parsed = await parseApiResponse<{ success: boolean; song?: any; error?: string }>(
        res,
        'Failed to add Jamendo track.'
      );
      if (!parsed.ok || !parsed.data?.success) {
        return { success: false, error: parsed.error || 'Failed to add Jamendo track.' };
      }

      if (socketRef.current) {
        socketRef.current.emit('room:refresh_songs');
      }

      addToast(`"${track.title}" added to room playlist!`, 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error adding Jamendo track.' };
    }
  };

  // Search YouTube
  const searchYouTube = async (
    query: string
  ): Promise<{ success: boolean; results?: YouTubeSearchResult[]; error?: string }> => {
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      const parsed = await parseApiResponse<{
        success: boolean;
        results?: YouTubeSearchResult[];
        error?: string;
      }>(res, 'Failed to search YouTube.');

      if (!parsed.ok || !parsed.data?.success) {
        return { success: false, error: parsed.error || 'Failed to search YouTube.' };
      }

      return {
        success: true,
        results: parsed.data.results || []
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error searching YouTube.'
      };
    }
  };

  // Add YouTube Video to Room
  const addYouTubeSong = async (video: {
    videoId: string;
    title: string;
    duration?: string;
    thumbnail?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!sessionToken || !currentRoom) {
      return { success: false, error: 'No active session or room found.' };
    }

    try {
      const res = await fetch(`/api/rooms/${currentRoom.code}/songs/youtube`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          videoId: video.videoId,
          title: video.title,
          duration: video.duration,
          thumbnail: video.thumbnail
        })
      });

      const parsed = await parseApiResponse<{ success: boolean; song?: any; error?: string }>(
        res,
        'Failed to add YouTube video.'
      );

      if (!parsed.ok || !parsed.data?.success) {
        const errMsg = parsed.error || 'Failed to add YouTube video.';
        addToast(errMsg, 'error');
        return { success: false, error: errMsg };
      }

      if (socketRef.current) {
        socketRef.current.emit('room:refresh_songs');
      }

      addToast(`Added "${video.title}" to room playlist!`, 'success');
      return { success: true };
    } catch (err: any) {
      const errMsg = err.message || 'Network error adding YouTube track.';
      addToast(errMsg, 'error');
      return { success: false, error: errMsg };
    }
  };

  // Start MusicDownloadAgent download for YouTube audio
  const startAgentDownload = async (
    url: string,
    onProgress?: (event: import('../types').AgentDownloadProgressEvent) => void
  ): Promise<{ success: boolean; error?: string; song?: any; jobId?: string }> => {
    if (!sessionToken || !currentRoom) {
      return { success: false, error: 'No active session or room found.' };
    }

    try {
      const res = await fetch(`/api/rooms/${currentRoom.code}/songs/agent-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ url })
      });

      const parsed = await parseApiResponse<{
        success: boolean;
        jobId: string;
        error?: string;
        message?: string;
      }>(res, 'Failed to start download job.');

      if (!parsed.ok || !parsed.data?.success || !parsed.data?.jobId) {
        const errorMsg = parsed.error || 'Failed to start download job.';
        return { success: false, error: errorMsg };
      }

      const jobId = parsed.data.jobId;

      return new Promise((resolve) => {
        let isDone = false;
        let eventSource: EventSource | null = null;
        let pollTimer: any = null;
        let isPollingActive = false;
        let pollAbortController: AbortController | null = null;
        let consecutivePollErrors = 0;

        const cleanup = () => {
          if (eventSource) {
            try {
              eventSource.close();
            } catch {}
            eventSource = null;
          }
          if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
          }
          if (pollAbortController) {
            try {
              pollAbortController.abort();
            } catch {}
            pollAbortController = null;
          }
        };

        const finish = (result: { success: boolean; error?: string; song?: any; jobId?: string }) => {
          if (isDone) return;
          isDone = true;
          cleanup();
          resolve(result);
        };

        const pollStatus = async () => {
          if (isDone) return;

          try {
            pollAbortController = new AbortController();
            const statusRes = await fetch(
              `/api/rooms/${currentRoom.code}/songs/agent-download/${jobId}/status`,
              { signal: pollAbortController.signal }
            );

            if (statusRes.status === 404) {
              finish({ success: false, error: 'Download job not found or expired.', jobId });
              return;
            }

            const parsedStatus = await parseApiResponse<{
              success: boolean;
              status: AgentDownloadPhase;
              jobId: string;
              roomCode: string;
              percent: number;
              message: string;
              data?: any;
              result?: any;
              error?: string;
            }>(statusRes, 'Failed to poll download status.');

            if (!parsedStatus.ok || !parsedStatus.data) {
              throw new Error(parsedStatus.error || `HTTP ${statusRes.status}`);
            }

            const statusData = parsedStatus.data;
            consecutivePollErrors = 0;

            if (statusData.status === 'completed') {
              if (socketRef.current) socketRef.current.emit('room:refresh_songs');
              addToast(statusData.message || 'Song downloaded and added to room playlist!', 'success');
              finish({ success: true, song: statusData.result, jobId });
              return;
            }

            if (statusData.status === 'error') {
              finish({
                success: false,
                error: statusData.error || statusData.message || 'Download failed.',
                jobId
              });
              return;
            }

            // In progress or queued: update progress UI
            if (onProgress) {
              onProgress({
                jobId: statusData.jobId,
                roomCode: statusData.roomCode,
                status: statusData.status,
                percent: statusData.percent,
                message: statusData.message,
                data: statusData.data || null,
                result: statusData.result || null,
                error: statusData.error || null
              });
            }

            // Schedule next poll in 2 seconds
            if (!isDone) {
              pollTimer = setTimeout(pollStatus, 2000);
            }
          } catch (err: any) {
            if (isDone) return;
            if (err?.name === 'AbortError') return;

            consecutivePollErrors++;
            // Allow up to 5 consecutive network errors (~10 seconds) before aborting
            if (consecutivePollErrors >= 5) {
              finish({
                success: false,
                error: 'Connection lost to download agent after multiple retries.',
                jobId
              });
              return;
            }

            pollTimer = setTimeout(pollStatus, 2000);
          }
        };

        const startPollingFallback = () => {
          if (isDone || isPollingActive) return;
          isPollingActive = true;
          if (eventSource) {
            try {
              eventSource.close();
            } catch {}
            eventSource = null;
          }
          pollStatus();
        };

        try {
          eventSource = new EventSource(
            `/api/rooms/${currentRoom.code}/songs/agent-download/${jobId}/progress`
          );

          eventSource.onmessage = (e) => {
            if (isDone) return;
            try {
              const ev = JSON.parse(e.data);
              if (onProgress) onProgress(ev);

              if (ev.status === 'completed') {
                if (socketRef.current) {
                  socketRef.current.emit('room:refresh_songs');
                }
                addToast(ev.message || 'Song downloaded and added to room playlist!', 'success');
                finish({ success: true, song: ev.result, jobId });
              } else if (ev.status === 'error') {
                const err = ev.error || ev.message || 'Download failed.';
                finish({ success: false, error: err, jobId });
              }
            } catch (parseErr) {
              console.error('Error parsing SSE event:', parseErr);
            }
          };

          eventSource.onerror = () => {
            // When SSE drops, smoothly transition to polling fallback instead of failing immediately
            startPollingFallback();
          };
        } catch {
          startPollingFallback();
        }
      });
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error initiating agent download.' };
    }
  };

  // Delete Song
  const deleteSong = async (songId: string): Promise<boolean> => {
    if (!sessionToken || !currentRoom) return false;
    try {
      const res = await fetch(`/api/rooms/${currentRoom.code}/songs/${songId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      const parsed = await parseApiResponse<{ success: boolean; error?: string }>(
        res,
        'Failed to remove song.'
      );
      if (parsed.ok && parsed.data?.success && socketRef.current) {
        socketRef.current.emit('room:refresh_songs');
        addToast('Song removed from room.', 'info');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Start Game
  const startGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('game:start');
      addToast('Game starting! Get ready...', 'info');
    }
  };

  // Toggle Discussion Skip Readiness
  const toggleDiscussionSkip = () => {
    if (socketRef.current && gameState?.round_id) {
      socketRef.current.emit('game:skip_discussion', {
        roundId: gameState.round_id
      });
    }
  };

  // Submit Vote ("Who Added This Song" mode)
  const submitVote = (votedPlayerId: string) => {
    if (socketRef.current && gameState?.round_id) {
      socketRef.current.emit('game:vote', {
        roundId: gameState.round_id,
        votedPlayerId
      });
      addToast('Vote submitted!', 'success');
    }
  };

  // Submit Guess ("Guess the Song" mode)
  const submitGuess = (guessTitle: string, guessArtist?: string) => {
    if (socketRef.current && gameState?.round_id) {
      socketRef.current.emit('game:guess', {
        roundId: gameState.round_id,
        guessTitle,
        guessArtist
      });
      addToast('Guess submitted!', 'success');
    }
  };

  // Skip Vote (Abstention)
  const skipVote = () => {
    if (socketRef.current && gameState?.round_id) {
      socketRef.current.emit('game:skip_vote', {
        roundId: gameState.round_id
      });
      addToast('Vote skipped (Abstention recorded)', 'info');
    }
  };

  // Send Emoji Reaction
  const sendReaction = (emoji: string) => {
    if (socketRef.current) {
      socketRef.current.emit('game:reaction', { emoji });
    }
  };

  // Rematch
  const rematch = () => {
    if (socketRef.current) {
      socketRef.current.emit('game:rematch');
      addToast('Rematch prepared! Ready up to play again.', 'success');
    }
  };

  // Return to Lobby
  const returnToLobby = () => {
    if (socketRef.current) {
      socketRef.current.emit('game:return_to_lobby');
    }
  };

  // Send Chat Message
  const sendChatMessage = (message: string) => {
    if (socketRef.current) {
      socketRef.current.emit('chat:send', { message });
    }
  };

  return (
    <GameContext.Provider
      value={{
        socket,
        connected,
        connecting,
        sessionToken,
        currentPlayer,
        currentRoom,
        players,
        songs,
        gameState,
        chatMessages,
        reactions,
        toasts,
        audioUnlocked,
        error,
        createRoom,
        joinRoom,
        leaveRoom,
        toggleReady,
        updateSettings,
        uploadSong,
        searchJamendo,
        addJamendoSong,
        searchYouTube,
        addYouTubeSong,
        startAgentDownload,
        deleteSong,
        startGame,
        submitVote,
        submitGuess,
        toggleDiscussionSkip,
        skipVote,
        sendReaction,
        rematch,
        returnToLobby,
        sendChatMessage,
        handleUnlockAudio,
        addToast,
        removeToast,
        clearError
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
