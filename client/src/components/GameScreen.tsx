import React, { useState, useEffect } from 'react';
import { Clock, Disc3, Award, FastForward, CheckCircle2 } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { formatTime } from '../utils/formatTime';
import { AudioPlayer } from './AudioPlayer';
import { YouTubePlayer } from './YouTubePlayer';
import { VotingControls } from './VotingControls';
import { RoundResults } from './RoundResults';
import { ChatDrawer } from './ChatDrawer';
import { ReactionsBar } from './ReactionsBar';
import { PlayerAvatar } from './PlayerAvatar';

export const GameScreen: React.FC = () => {
  const { gameState, players, currentPlayer, toggleDiscussionSkip } = useGame();
  const [discussionSecondsLeft, setDiscussionSecondsLeft] = useState<number>(0);
  const [listeningSecondsLeft, setListeningSecondsLeft] = useState<number>(0);

  const phase = gameState?.phase;
  const currentSong = gameState?.current_song;
  const isGuessMode = gameState?.game_mode === 'guess_song';

  // Listening countdown
  useEffect(() => {
    if (phase !== 'playing' || !gameState?.phase_ends_at) return;

    const updateTimer = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((gameState.phase_ends_at! - now) / 1000));
      setListeningSecondsLeft(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [phase, gameState?.phase_ends_at]);

  // Discussion countdown
  useEffect(() => {
    if (phase !== 'discussing' || !gameState?.phase_ends_at) return;

    const updateTimer = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((gameState.phase_ends_at! - now) / 1000));
      setDiscussionSecondsLeft(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [phase, gameState?.phase_ends_at]);

  if (!gameState) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '980px', margin: '0 auto', width: '100%' }}>
      {/* Game Header: Round, Game Mode, Phase Badge */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1.25rem 1.75rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Round {gameState.current_round} of {gameState.total_rounds}
            </span>
            <span className="badge badge-phase">
              {isGuessMode ? '🎯 Guess the Song' : '🕵️ Who Added This Song?'}
            </span>
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Round {gameState.current_round}{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 500 }}>
              / {gameState.total_rounds}
            </span>
          </div>
        </div>

        {/* Phase Indicator Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {phase === 'playing' && (
            <span className="badge badge-phase" style={{ padding: '0.6rem 1.1rem', fontSize: '0.85rem' }}>
              🎵 Listening Phase
            </span>
          )}
          {phase === 'discussing' && (
            <span
              className="badge"
              style={{
                background: 'rgba(6, 182, 212, 0.2)',
                color: 'var(--cyan)',
                border: '1px solid var(--border-cyan)',
                padding: '0.6rem 1.1rem',
                fontSize: '0.85rem'
              }}
            >
              💬 Discussion Phase
            </span>
          )}
          {phase === 'voting' && (
            <span
              className="badge"
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                padding: '0.6rem 1.1rem',
                fontSize: '0.85rem'
              }}
            >
              {isGuessMode ? '✍️ Submit Guesses' : '🗳️ Cast Your Vote'}
            </span>
          )}
          {phase === 'revealed' && (
            <span className="badge badge-ready" style={{ padding: '0.6rem 1.1rem', fontSize: '0.85rem' }}>
              ✨ Round Reveal
            </span>
          )}
        </div>
      </div>

      {/* Main Phase Container */}
      {phase === 'playing' && currentSong && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {currentSong.source_type === 'youtube' && currentSong.external_id ? (
            <>
              <YouTubePlayer
                videoId={currentSong.external_id}
                durationSeconds={currentSong.duration_seconds}
                phaseEndsAt={gameState.phase_ends_at}
              />
              <div className="card card-glow" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.4rem 1rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    marginBottom: '1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      animation: 'pulse 1.5s infinite'
                    }}
                  />
                  YouTube Audio Playback
                </div>

                <div
                  style={{
                    fontSize: '2.75rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--cyan)',
                    marginBottom: '0.75rem',
                    textShadow: '0 0 20px var(--cyan-glow)'
                  }}
                >
                  {formatTime(listeningSecondsLeft)}
                </div>

                <Disc3 size={46} color="#ef4444" style={{ animation: 'spin 3s linear infinite', marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                  {isGuessMode ? 'Identify the Track!' : 'Who Added This Song?'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
                  {isGuessMode
                    ? 'Listen closely to the audio. When audio ends, you will discuss and enter your song title and artist guesses!'
                    : 'Listen to the music and genres. Try to guess which friend in this room added this track! Discussion will open shortly.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <AudioPlayer
                songId={currentSong.id}
                playbackStartTime={gameState.playback_start_time}
                phaseEndsAt={gameState.phase_ends_at}
                durationSeconds={currentSong.duration_seconds}
              />
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <Disc3 size={46} color="var(--cyan)" style={{ animation: 'spin 3s linear infinite', marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                  {isGuessMode ? 'Identify the Track!' : 'Who Added This Song?'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
                  {isGuessMode
                    ? 'Listen closely to the vocals, beat, and melody. When audio ends, you will discuss and enter your song title and artist guesses!'
                    : 'Listen to the music and genres. Try to guess which friend in this room added this track! Discussion will open shortly.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'discussing' && (
        <div
          className="card card-glow"
          style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem'
          }}
        >
          <div
            style={{
              padding: '0.65rem 1.75rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '2px solid var(--cyan)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.65rem',
              fontSize: '2.2rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--cyan)',
              boxShadow: '0 0 35px var(--cyan-glow)'
            }}
          >
            <Clock size={28} />
            <span>{formatTime(discussionSecondsLeft)}</span>
          </div>

          <h2 style={{ fontSize: '1.9rem', fontWeight: 800 }}>
            Discussion & Interrogation!
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '540px', fontSize: '0.95rem', lineHeight: 1.6 }}>
            {isGuessMode
              ? 'Know this song or artist? Debate in chat or react using the emojis below before answers open!'
              : 'Whose taste in music is this? Question your friends, watch reactions, or open the room chat!'}
          </p>

          {/* Skip Discussion Action & Readiness Tracker */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem 2rem',
              maxWidth: '440px',
              width: '100%',
              marginTop: '0.5rem'
            }}
          >
            <button
              type="button"
              onClick={toggleDiscussionSkip}
              className={`btn btn-lg ${gameState.has_skipped_discussion ? 'btn-emerald' : 'btn-cyan'}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                fontSize: '1rem',
                padding: '0.85rem 1.5rem',
                fontWeight: 700
              }}
            >
              {gameState.has_skipped_discussion ? (
                <>
                  <CheckCircle2 size={20} /> You're Ready • Cancel Skip
                </>
              ) : (
                <>
                  <FastForward size={20} /> Skip Discussion
                </>
              )}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                {gameState.discussion_skips_count ?? 0} / {gameState.total_discussion_eligible ?? players.length}
              </span>
              <span>players ready to continue</span>
            </div>

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
                  width: `${Math.min(100, Math.round(((gameState.discussion_skips_count ?? 0) / Math.max(1, (gameState.total_discussion_eligible ?? players.length))) * 100))}%`,
                  background: 'linear-gradient(90deg, var(--cyan), var(--emerald))',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.3s ease-out'
                }}
              />
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Discussion ends and voting begins when all players are ready.
            </span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              marginTop: '0.25rem'
            }}
          >
            <Clock size={16} /> Submissions open automatically when the timer reaches zero.
          </div>
        </div>
      )}

      {phase === 'voting' && <VotingControls />}

      {phase === 'revealed' && <RoundResults />}

      {/* Real-time Emoji Reactions Bar (Active during playing & discussing) */}
      {(phase === 'playing' || phase === 'discussing' || phase === 'voting') && (
        <ReactionsBar />
      )}

      {/* Live Compact Leaderboard */}
      <div className="card">
        <h4 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award size={18} color="var(--primary)" /> Live Scores
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.65rem'
          }}
        >
          {players.map((p) => {
            const isMe = p.id === currentPlayer?.id;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.9rem',
                  background: isMe ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: isMe ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                  <PlayerAvatar nickname={p.nickname} size={26} isHost={p.is_host} />
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.nickname} {isMe ? '(You)' : ''}
                  </span>
                </div>
                <strong style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                  {p.score} pts
                </strong>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Chat Drawer */}
      <ChatDrawer />
    </div>
  );
};
