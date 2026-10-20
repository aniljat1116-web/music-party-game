import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, AlertTriangle, Disc3, ShieldAlert } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { formatTime } from '../utils/formatTime';

interface AudioPlayerProps {
  songId: string;
  playbackStartTime: number | null;
  phaseEndsAt: number | null;
  durationSeconds: number;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  songId,
  playbackStartTime,
  phaseEndsAt,
  durationSeconds
}) => {
  const { currentRoom, sessionToken, audioUnlocked, handleUnlockAudio } = useGame();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio Context & Analyser references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(durationSeconds);
  const [syncStatus, setSyncStatus] = useState<string>('Syncing...');

  const audioUrl = currentRoom && sessionToken
    ? `/api/rooms/${currentRoom.code}/audio/${songId}?token=${encodeURIComponent(sessionToken)}`
    : '';

  // Setup Web Audio API Analyser
  const setupWebAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        if (!sourceNodeRef.current) {
          const source = ctx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          sourceNodeRef.current = source;
        }
      }
    } catch (e) {
      console.warn('Web Audio API analyser setup note:', e);
    }
  }, []);

  // Canvas visualizer render loop
  const renderVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 24;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Flat baseline when paused
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.max(0, dataArray[i] * 0.9);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.8;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i];
        const barHeight = Math.max(3, (val / 255) * canvas.height * 0.85);

        // Vibrant gradient: purple to cyan
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(0.6, '#8b5cf6');
        gradient.addColorStop(1, '#6366f1');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, canvas.height - barHeight, Math.max(2, barWidth - 3), barHeight, [3, 3, 0, 0]);
        } else {
          ctx.rect(x, canvas.height - barHeight, Math.max(2, barWidth - 3), barHeight);
        }
        ctx.fill();

        x += barWidth;
      }
    };

    draw();
  }, [isPlaying]);

  useEffect(() => {
    renderVisualizer();
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [renderVisualizer]);

  // Main Audio sync logic
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    setLoadError(null);
    audio.src = audioUrl;
    audio.load();

    const handleCanPlay = () => setLoadError(null);
    const handleError = () => {
      setLoadError('Failed to load audio stream from server.');
      setIsPlaying(false);
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    let syncInterval: ReturnType<typeof setInterval> | null = null;

    const attemptPlay = () => {
      setupWebAudio();
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setPlaybackBlocked(false);
        })
        .catch((err) => {
          console.warn('Autoplay blocked:', err);
          setPlaybackBlocked(true);
          setIsPlaying(false);
        });
    };

    syncInterval = setInterval(() => {
      const now = Date.now();

      if (phaseEndsAt) {
        const left = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
        setTimeRemaining(left);
      }

      if (playbackStartTime) {
        if (now < playbackStartTime) {
          const secsToStart = Math.ceil((playbackStartTime - now) / 1000);
          setSyncStatus(`Buffering... Starting in ${secsToStart}s`);
          audio.currentTime = 0;
          if (!audio.paused) audio.pause();
          setProgress(0);
        } else {
          const elapsed = (now - playbackStartTime) / 1000;
          const totalDuration = durationSeconds || 30;
          const currentProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
          setProgress(currentProgress);

          if (elapsed < totalDuration) {
            setSyncStatus(`Synchronized • ${Math.floor(elapsed)}s / ${totalDuration}s`);
            if (audio.paused && !playbackBlocked) {
              attemptPlay();
            }
            // Drift correction
            const drift = Math.abs(audio.currentTime - elapsed);
            if (drift > 0.5) {
              audio.currentTime = elapsed;
            }
          } else {
            setSyncStatus('Playback finished');
            if (!audio.paused) {
              audio.pause();
              setIsPlaying(false);
            }
          }
        }
      }
    }, 200);

    return () => {
      if (syncInterval) clearInterval(syncInterval);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl, playbackStartTime, phaseEndsAt, durationSeconds, playbackBlocked, setupWebAudio]);

  const toggleMute = () => {
    if (audioRef.current) {
      const nextMuted = !isMuted;
      audioRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
        audioRef.current.muted = true;
      } else if (isMuted) {
        setIsMuted(false);
        audioRef.current.muted = false;
      }
    }
  };

  const handleManualPlay = async () => {
    await handleUnlockAudio();
    setupWebAudio();
    if (audioRef.current) {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setPlaybackBlocked(false);
        })
        .catch(console.error);
    }
  };

  return (
    <div
      className="card card-glow"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 22, 41, 0.95), rgba(22, 32, 59, 0.95))',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 10px 35px rgba(0, 0, 0, 0.4)'
      }}
    >
      <audio ref={audioRef} preload="auto" playsInline />

      {/* Autoplay / audio unlock banner */}
      {(playbackBlocked || !audioUnlocked) && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#fbbf24',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            fontSize: '0.85rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} />
            <span>Click to enable and synchronize audio with all players.</span>
          </div>
          <button className="btn btn-sm btn-cyan" onClick={handleManualPlay}>
            <Volume2 size={15} /> Enable Audio
          </button>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185',
            padding: '0.65rem 1rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem'
          }}
        >
          <ShieldAlert size={16} />
          <span>{loadError}</span>
        </div>
      )}

      {/* Visualizer Canvas & Track Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: isPlaying
                ? 'linear-gradient(135deg, var(--primary), var(--cyan))'
                : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: isPlaying ? '0 0 20px var(--primary-glow)' : 'none',
              transition: 'all 0.3s ease'
            }}
          >
            <Disc3
              size={26}
              style={{
                animation: isPlaying ? 'spin 3s linear infinite' : 'none'
              }}
            />
          </div>

          <div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
              {isPlaying ? 'Now Playing' : 'Synchronizing Audio...'}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isPlaying ? '#10b981' : '#f59e0b',
                  boxShadow: isPlaying ? '0 0 8px #10b981' : 'none'
                }}
              />
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                {syncStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Real reactive Audio Spectrum Canvas */}
        <canvas
          ref={canvasRef}
          width={180}
          height={40}
          style={{
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            maxWidth: '180px'
          }}
        />

        {/* Volume & Remaining seconds */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {/* Volume Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              style={{ padding: '0.35rem' }}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={18} color="var(--rose)" />
              ) : (
                <Volume2 size={18} color="var(--cyan)" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              style={{
                width: '75px',
                accentColor: 'var(--cyan)',
                cursor: 'pointer'
              }}
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '1.25rem',
              color: 'var(--cyan)'
            }}
          >
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--cyan), var(--primary))',
            borderRadius: 'var(--radius-full)',
            transition: 'width 0.2s linear'
          }}
        />
      </div>
    </div>
  );
};
