import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, AlertTriangle, Play, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

// Singleton API Loader to prevent duplicate scripts or race conditions
let isYtScriptLoading = false;
const ytReadyCallbacks: Array<() => void> = [];

function loadYouTubeIFrameAPI(callback: () => void) {
  if (typeof window === 'undefined') return;

  if (window.YT && window.YT.Player) {
    callback();
    return;
  }

  ytReadyCallbacks.push(callback);

  if (!isYtScriptLoading) {
    isYtScriptLoading = true;
    const existingScript = document.getElementById('youtube-iframe-api');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevOnReady === 'function') {
        try {
          prevOnReady();
        } catch (e) {
          console.warn('Previous onYouTubeIframeAPIReady handler error:', e);
        }
      }
      while (ytReadyCallbacks.length > 0) {
        const cb = ytReadyCallbacks.shift();
        if (cb) {
          try {
            cb();
          } catch (e) {
            console.error('Error invoking YT ready callback:', e);
          }
        }
      }
    };
  }
}

interface YouTubePlayerProps {
  videoId: string;
  durationSeconds?: number;
  phaseEndsAt?: number | null;
  onEnded?: () => void;
  onError?: (code: number) => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  durationSeconds: _durationSeconds = 30,
  phaseEndsAt: _phaseEndsAt,
  onEnded,
  onError
}) => {
  const containerId = useRef(`yt-player-${Math.random().toString(36).slice(2, 9)}`);
  const playerRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string>(videoId);

  const [isApiReady, setIsApiReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Initialize YouTube IFrame API
  useEffect(() => {
    let isMounted = true;
    loadYouTubeIFrameAPI(() => {
      if (isMounted) {
        setIsApiReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize or update YouTube Player instance
  useEffect(() => {
    if (!isApiReady || !videoId) return;

    // If player exists, switch video without recreating the iframe
    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      if (currentVideoIdRef.current !== videoId) {
        currentVideoIdRef.current = videoId;
        setLoadError(null);
        setAutoplayBlocked(false);
        try {
          playerRef.current.loadVideoById({
            videoId: videoId,
            startSeconds: 0
          });
        } catch (err) {
          console.warn('Error switching YouTube video:', err);
        }
      }
      return;
    }

    // Create player if container exists
    const domElem = document.getElementById(containerId.current);
    if (!domElem) return;

    try {
      currentVideoIdRef.current = videoId;
      setLoadError(null);

      playerRef.current = new window.YT.Player(containerId.current, {
        width: 200,
        height: 150,
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          disablekb: 0,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            try {
              event.target.playVideo();
            } catch (err) {
              console.warn('Autoplay prevented by browser:', err);
              setAutoplayBlocked(true);
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setAutoplayBlocked(false);
              setLoadError(null);
            } else if (state === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (state === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              // Note: Intentionally do NOT advance the round from client-side ENDED.
              // Server-side authoritative timers and socket events control round progression.
              if (onEnded) onEnded();
            } else if (state === window.YT.PlayerState.UNSTARTED) {
              // Might be blocked by autoplay policies
              setTimeout(() => {
                if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
                  const currentState = playerRef.current.getPlayerState();
                  if (currentState !== window.YT.PlayerState.PLAYING && currentState !== window.YT.PlayerState.BUFFERING) {
                    setAutoplayBlocked(true);
                  }
                }
              }, 1200);
            }
          },
          onError: (event: any) => {
            const errorCode = event.data;
            let msg = 'Playback error occurred.';
            if (errorCode === 2) msg = 'Invalid YouTube video ID.';
            else if (errorCode === 5) msg = 'HTML5 player error.';
            else if (errorCode === 100) msg = 'Video not found or removed.';
            else if (errorCode === 101 || errorCode === 150) {
              msg = 'Video owner restricted embedding on external sites.';
            }

            setLoadError(msg);
            setIsPlaying(false);
            if (onError) onError(errorCode);
          }
        }
      });
    } catch (err: any) {
      console.error('Failed to instantiate YouTube player:', err);
      setLoadError('Failed to initialize YouTube player.');
    }

    return () => {
      // Clean up player instance on unmount to prevent leaks
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying YouTube player:', e);
        }
        playerRef.current = null;
      }
    };
  }, [isApiReady, videoId, onEnded, onError]);

  // Handle explicit Play gesture if browser blocked autoplay
  const handleEnablePlayback = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      try {
        playerRef.current.playVideo();
        setAutoplayBlocked(false);
      } catch (e) {
        console.warn('Manual play failed:', e);
      }
    }
  }, []);

  // Handle Mute toggle
  const toggleMute = useCallback(() => {
    if (!playerRef.current) return;
    try {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch (e) {
      console.warn('Mute toggle error:', e);
    }
  }, [isMuted]);

  return (
    <aside
      aria-label="YouTube Game Player"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '200px',
        zIndex: 900,
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#0a0f1d',
        border: '2px solid rgba(239, 68, 68, 0.4)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(239, 68, 68, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      {/* Compact Player Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#f87171'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: isPlaying ? '#22c55e' : '#ef4444'
            }}
          />
          <span>YouTube Music</span>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>

      {/* 200x150 IFrame Container - completely visible and unobscured */}
      <div
        style={{
          width: '200px',
          height: '150px',
          position: 'relative',
          background: '#000'
        }}
      >
        <div id={containerId.current} style={{ width: '200px', height: '150px' }} />

        {/* Loading Spinner */}
        {!isApiReady && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0a0f1d',
              gap: '6px',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem'
            }}
          >
            <Loader2 size={20} className="spin" color="#ef4444" />
            <span>Connecting...</span>
          </div>
        )}

        {/* Autoplay Blocked Notice */}
        {autoplayBlocked && !loadError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5, 8, 20, 0.88)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              textAlign: 'center'
            }}
          >
            <span style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 600 }}>
              Autoplay Paused
            </span>
            <button
              type="button"
              onClick={handleEnablePlayback}
              className="btn btn-sm btn-cyan"
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Play size={12} /> Play
            </button>
          </div>
        )}

        {/* Error State */}
        {loadError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              textAlign: 'center'
            }}
          >
            <AlertTriangle size={18} color="#ef4444" />
            <span style={{ fontSize: '0.68rem', color: '#fca5a5', lineHeight: 1.3 }}>
              {loadError}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
