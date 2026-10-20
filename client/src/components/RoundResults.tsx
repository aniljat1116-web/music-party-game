import React, { useState, useEffect } from 'react';
import { Award, Check, X, Sparkles, Disc3, Clock, Music, FastForward } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { PlayerAvatar } from './PlayerAvatar';

export const RoundResults: React.FC = () => {
  const { gameState } = useGame();
  const [secondsLeft, setSecondsLeft] = useState<number>(10);

  const roundResult = gameState?.round_result;
  const isGuessMode = gameState?.game_mode === 'guess_song';

  useEffect(() => {
    if (!gameState?.phase_ends_at) return;

    const updateTimer = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((gameState.phase_ends_at! - now) / 1000));
      setSecondsLeft(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [gameState?.phase_ends_at]);

  if (!roundResult) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '920px', margin: '0 auto', width: '100%' }}>
      {/* Dramatic Reveal Banner */}
      <div
        className="card card-glow"
        style={{
          textAlign: 'center',
          padding: '2.5rem 1.5rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(6, 182, 212, 0.25))',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div className="badge badge-phase" style={{ marginBottom: '1rem' }}>
          Round {roundResult.round_number} Reveal
        </div>

        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.3rem)', fontWeight: 800, marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          {isGuessMode ? 'The Mystery Track Revealed!' : 'This Song Was Added By...'}
        </h2>

        {/* Reveal Card */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '1.25rem',
            padding: '1.1rem 2rem',
            background: 'rgba(15, 22, 41, 0.9)',
            border: '2px solid var(--primary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 0 40px var(--primary-glow)',
            margin: '1.25rem 0',
            maxWidth: '100%',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          {roundResult.artwork_url && (
            <img
              src={roundResult.artwork_url}
              alt={roundResult.song_title}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: 'var(--radius-md)',
                objectFit: 'cover',
                border: '1px solid var(--border-cyan)',
                boxShadow: '0 0 20px var(--cyan-glow)'
              }}
            />
          )}
          <PlayerAvatar
            nickname={roundResult.uploader_nickname}
            size={52}
          />
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Uploaded by
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {roundResult.uploader_nickname}
            </div>
          </div>
        </div>

        {/* Song & Artist details */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--cyan)' }}>
            <Disc3 size={20} />
            <span>"{roundResult.song_title}"</span>
          </div>
          {roundResult.artist && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              <Music size={15} />
              <span>by {roundResult.artist}</span>
            </div>
          )}
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--cyan)', fontSize: '0.925rem', fontWeight: 700 }}>
          <Clock size={16} /> Next round starts in {secondsLeft}s...
        </div>
      </div>

      {/* Grid: Left = Submissions Breakdown, Right = Round Scores */}
      <div className="grid-2">
        {/* Submissions Breakdown */}
        <div className="card">
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} color="var(--cyan)" />
            {isGuessMode ? 'Guesses & Points' : 'Submitted Votes'}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {roundResult.votes.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem' }}>
                No votes or guesses were recorded this round.
              </div>
            ) : (
              roundResult.votes.map((v, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: v.is_skipped
                      ? 'rgba(148, 163, 184, 0.06)'
                      : v.is_correct
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(244, 63, 94, 0.08)',
                    border: v.is_skipped
                      ? '1px solid rgba(148, 163, 184, 0.2)'
                      : v.is_correct
                        ? '1px solid rgba(16, 185, 129, 0.3)'
                        : '1px solid rgba(244, 63, 94, 0.2)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                    <PlayerAvatar nickname={v.voter_nickname} size={28} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{v.voter_nickname}</span>
                      {v.is_skipped ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Abstained (Skipped voting)
                        </span>
                      ) : isGuessMode ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Guessed: "{v.guess_title || 'No title'}" {v.guess_artist ? `by ${v.guess_artist}` : ''}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Guessed: <strong>{v.voted_nickname}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    {v.is_skipped ? (
                      <span className="badge badge-phase" style={{ background: 'rgba(148, 163, 184, 0.15)', color: 'var(--text-muted)' }}>
                        <FastForward size={12} /> Abstained (+0)
                      </span>
                    ) : v.points_awarded > 0 ? (
                      <span className="badge badge-ready">
                        <Check size={12} /> +{v.points_awarded} {v.points_awarded === 1 ? 'pt' : 'pts'}
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}>
                        <X size={12} /> +0
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Updated Round Scores & Live Leaderboard */}
        <div className="card">
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={18} color="var(--primary)" /> Leaderboard Standings
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {roundResult.scores.map((s, idx) => (
              <div
                key={s.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      fontWeight: 800,
                      color: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#b45309' : 'var(--text-muted)',
                      width: '24px',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    #{idx + 1}
                  </span>
                  <PlayerAvatar nickname={s.nickname} size={30} />
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.nickname}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {s.points_earned > 0 && (
                    <span
                      style={{
                        color: 'var(--emerald)',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        background: 'rgba(16, 185, 129, 0.15)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      +{s.points_earned}
                    </span>
                  )}
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    {s.score} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
