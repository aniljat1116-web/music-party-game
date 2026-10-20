import React, { useState, useEffect } from 'react';
import { UserCheck, Clock, CheckCircle2, Music2, EyeOff, Sparkles, Send, FastForward } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { formatTime } from '../utils/formatTime';
import { PlayerAvatar } from './PlayerAvatar';

export const VotingControls: React.FC = () => {
  const {
    players,
    currentPlayer,
    gameState,
    submitVote,
    submitGuess,
    skipVote
  } = useGame();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [guessTitle, setGuessTitle] = useState('');
  const [guessArtist, setGuessArtist] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number>(15);

  const isMySong = Boolean(gameState?.is_my_song);
  const hasVoted = Boolean(gameState?.has_voted);
  const votesCount = gameState?.votes_submitted_count || 0;
  const totalEligible = gameState?.total_eligible_voters || players.length - 1;
  const isGuessMode = gameState?.game_mode === 'guess_song';

  // Countdown timer for voting/guessing
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

  const handleVoteSubmit = (targetPlayerId: string) => {
    if (hasVoted || isMySong) return;
    setSelectedPlayerId(targetPlayerId);
    submitVote(targetPlayerId);
  };

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasVoted || isMySong || !guessTitle.trim()) return;
    submitGuess(guessTitle.trim(), guessArtist.trim() || undefined);
  };

  return (
    <div className="card card-glow" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header: Voting / Guess Title & Countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isGuessMode ? (
              <>
                <Sparkles size={22} color="var(--cyan)" /> Guess the Song & Artist
              </>
            ) : (
              <>
                <UserCheck size={22} color="var(--primary)" /> Who Added This Song?
              </>
            )}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {isGuessMode
              ? 'Privately submit your guess for the song title and artist before time runs out!'
              : 'Cast your vote for the friend you think uploaded this track.'}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid var(--border-accent)',
            padding: '0.4rem 0.95rem',
            borderRadius: 'var(--radius-full)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--primary)',
            fontSize: '0.95rem'
          }}
        >
          <Clock size={16} />
          <span>{formatTime(secondsLeft)}</span>
        </div>
      </div>

      {/* Special Uploader Notice: Uploader cannot vote or guess on their own song! */}
      {isMySong ? (
        <div
          style={{
            padding: '1.75rem',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2))',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 20px var(--primary-glow)'
            }}
          >
            <Music2 size={26} />
          </div>
          <h4 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            This is YOUR uploaded song!
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', maxWidth: '460px' }}>
            {isGuessMode
              ? 'Sit back and enjoy the music! Your friends are trying to guess your track title and artist. You cannot guess your own song.'
              : 'Sit back and enjoy the show! Your friends are trying to figure out that this was uploaded by you.'}
          </p>
          <div className="badge badge-phase" style={{ marginTop: '0.5rem' }}>
            Answers submitted so far: {votesCount} / {totalEligible}
          </div>
        </div>
      ) : hasVoted ? (
        gameState?.has_skipped_vote ? (
          /* Player explicitly skipped voting (abstention) */
          <div
            style={{
              padding: '1.75rem',
              background: 'rgba(148, 163, 184, 0.08)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <FastForward size={36} color="var(--text-secondary)" />
            <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Voting Skipped (Abstention Recorded)
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              You chose to skip voting for this round (+0 pts). Waiting for other players to finish...
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}
            >
              <EyeOff size={16} /> All submissions remain secret until the round reveal
            </div>
            <div className="badge badge-phase">
              {votesCount} of {totalEligible} submissions recorded
            </div>
          </div>
        ) : (
          /* Player already cast their vote or guess */
          <div
            style={{
              padding: '1.75rem',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <CheckCircle2 size={40} color="var(--emerald)" />
            <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--emerald)' }}>
              {isGuessMode ? 'Guess Submitted Successfully!' : 'Vote Cast Successfully!'}
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Waiting for other players to finish submitting...
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}
            >
              <EyeOff size={16} /> All submissions remain secret until the round reveal
            </div>
            <div className="badge badge-ready">
              {votesCount} of {totalEligible} submissions recorded
            </div>
          </div>
        )
      ) : isGuessMode ? (
        /* "Guess the Song" Mode: Input Form */
        <form onSubmit={handleGuessSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem'
            }}
          >
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="guessTitle">
                Song Title Guess (Required)
              </label>
              <input
                id="guessTitle"
                className="form-input"
                type="text"
                placeholder="e.g. Blinding Lights, Hotel California"
                value={guessTitle}
                onChange={(e) => setGuessTitle(e.target.value)}
                maxLength={80}
                required
                autoFocus
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Correct Title awards <strong>+2 points</strong> (normalized for spelling/casing)
              </span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="guessArtist">
                Artist Name Guess (Optional Bonus)
              </label>
              <input
                id="guessArtist"
                className="form-input"
                type="text"
                placeholder="e.g. The Weeknd, Eagles"
                value={guessArtist}
                onChange={(e) => setGuessArtist(e.target.value)}
                maxLength={80}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Correct Artist awards <strong>+1 bonus point</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Submissions: {votesCount} / {totalEligible}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={skipVote}
                title="Skip submitting a guess (records abstention)"
              >
                <FastForward size={16} /> Skip Voting
              </button>
              <button
                type="submit"
                className="btn btn-cyan btn-lg"
                disabled={!guessTitle.trim()}
                style={{ minWidth: '160px' }}
              >
                <Send size={18} /> Submit Guess
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* "Who Added This Song" Mode: Player buttons */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.75rem'
            }}
          >
            {players.map((p) => {
              const isSelf = p.id === currentPlayer?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleVoteSubmit(p.id)}
                  disabled={hasVoted || isSelf}
                  className={`btn ${selectedPlayerId === p.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 'var(--radius-md)',
                    border: selectedPlayerId === p.id ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    opacity: isSelf ? 0.35 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <PlayerAvatar nickname={p.nickname} size={30} isHost={p.is_host} />
                    <span style={{ fontWeight: 700 }}>{p.nickname}</span>
                  </div>
                  {isSelf && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(You)</span>}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Click any friend to cast your vote (1 point if correct).
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--cyan)', fontWeight: 600 }}>
                {votesCount} / {totalEligible} submissions recorded
              </span>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={skipVote}
              title="Skip voting for this round (records abstention)"
            >
              <FastForward size={16} /> Skip Voting
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
