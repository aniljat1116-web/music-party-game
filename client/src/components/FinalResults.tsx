import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Crown, RotateCcw, PlusCircle, Medal, HelpCircle } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { PlayerAvatar } from './PlayerAvatar';
import { ConfirmationModal } from './ConfirmationModal';

interface FinalResultsProps {
  onCreateNewRoom: () => void;
}

export const FinalResults: React.FC<FinalResultsProps> = ({ onCreateNewRoom }) => {
  const { gameState, currentPlayer, rematch, returnToLobby, leaveRoom } = useGame();
  const [showTieInfo, setShowTieInfo] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const rankings = gameState?.final_rankings || [];
  const isHost = currentPlayer?.is_host;

  // Trigger confetti celebration on view
  useEffect(() => {
    try {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch {
      // Ignored if canvas fails
    }
  }, []);

  const winners = rankings.filter((r) => r.is_winner);
  const isTie = winners.length > 1;

  const handleCreateAnother = () => {
    leaveRoom();
    onCreateNewRoom();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '720px', margin: '1rem auto', width: '100%' }}>
      {/* Leave Room Modal */}
      <ConfirmationModal
        isOpen={showLeaveModal}
        title="Leave Room?"
        message="Are you sure you want to leave this room? You can create a new room or return to the home screen."
        confirmLabel="Leave Room"
        onConfirm={handleCreateAnother}
        onCancel={() => setShowLeaveModal(false)}
      />

      {/* Victory Header */}
      <div
        className="card card-glow"
        style={{
          textAlign: 'center',
          padding: '2.75rem 1.75rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.35), rgba(6, 182, 212, 0.25))',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 0 35px rgba(245, 158, 11, 0.55)',
            marginBottom: '1.25rem'
          }}
        >
          <Trophy size={34} />
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', fontWeight: 800, marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          Match Complete!
        </h1>

        {isTie ? (
          <div>
            <h3 style={{ fontSize: '1.4rem', color: '#fbbf24', fontWeight: 800 }}>
              🤝 It's a Tie for 1st Place!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginTop: '0.35rem' }}>
              Congratulations to champions <strong>{winners.map((w) => w.nickname).join(' & ')}</strong>!
            </p>
          </div>
        ) : winners.length === 1 ? (
          <div>
            <h3 style={{ fontSize: '1.4rem', color: '#fbbf24', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Crown size={24} /> Champion: {winners[0].nickname}!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginTop: '0.35rem' }}>
              Winning with an incredible {winners[0].score} points!
            </p>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>Well played everyone!</p>
        )}
      </div>

      {/* Podium Top 3 (if 3 or more players) */}
      {rankings.length >= 2 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: '1rem',
            padding: '1rem 0',
            margin: '0 auto',
            width: '100%'
          }}
        >
          {/* 2nd Place */}
          {rankings[1] && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                flex: 1,
                maxWidth: '180px'
              }}
            >
              <PlayerAvatar nickname={rankings[1].nickname} size={50} />
              <div
                style={{
                  width: '100%',
                  background: 'rgba(203, 213, 225, 0.12)',
                  border: '1px solid rgba(203, 213, 225, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem 0.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 800 }}>🥈 2ND</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                  {rankings[1].nickname}
                </span>
                <strong style={{ color: 'var(--cyan)', marginTop: '0.2rem' }}>{rankings[1].score} pts</strong>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {rankings[0] && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                flex: 1.1,
                maxWidth: '200px'
              }}
            >
              <div style={{ position: 'relative' }}>
                <PlayerAvatar nickname={rankings[0].nickname} size={64} />
                <Crown
                  size={20}
                  color="#fbbf24"
                  style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }}
                />
              </div>
              <div
                style={{
                  width: '100%',
                  background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.08))',
                  border: '2px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem 0.5rem 1rem',
                  textAlign: 'center',
                  boxShadow: '0 0 25px rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 800 }}>👑 1ST PLACE</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                  {rankings[0].nickname}
                </span>
                <strong style={{ color: '#fbbf24', fontSize: '1.2rem', marginTop: '0.2rem' }}>{rankings[0].score} pts</strong>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {rankings[2] && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                flex: 1,
                maxWidth: '180px'
              }}
            >
              <PlayerAvatar nickname={rankings[2].nickname} size={46} />
              <div
                style={{
                  width: '100%',
                  background: 'rgba(180, 83, 9, 0.12)',
                  border: '1px solid rgba(180, 83, 9, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 0.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 800 }}>🥉 3RD</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                  {rankings[2].nickname}
                </span>
                <strong style={{ color: 'var(--cyan)', marginTop: '0.2rem' }}>{rankings[2].score} pts</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Medal size={20} color="var(--primary)" /> Full Standings
          </h3>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTieInfo(!showTieInfo)}
            style={{ fontSize: '0.75rem', gap: '0.35rem', color: 'var(--text-muted)' }}
          >
            <HelpCircle size={14} /> Tie rules
          </button>
        </div>

        {showTieInfo && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '1rem',
              lineHeight: 1.5
            }}
          >
            <strong>Tie-Breaking Rule:</strong> Players who achieve identical total scores share the same ranking position (e.g. joint 1st). The next player takes the rank corresponding to their standing position.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {rankings.map((r) => (
            <div
              key={r.player_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.9rem 1.25rem',
                background: r.is_winner ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: r.is_winner ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <span
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: r.rank === 1 ? '#fbbf24' : r.rank === 2 ? '#cbd5e1' : r.rank === 3 ? '#d97706' : 'var(--text-muted)',
                    width: '32px'
                  }}
                >
                  #{r.rank}
                </span>

                <PlayerAvatar nickname={r.nickname} size={36} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{r.nickname}</span>
                  {r.player_id === currentPlayer?.id && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(You)</span>
                  )}
                  {r.is_winner && (
                    <span className="badge badge-host">
                      <Crown size={12} /> Winner
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                {r.score} pts
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons: Rematch, Return to Lobby, New Room */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {isHost ? (
          <>
            <button
              className="btn btn-primary btn-lg"
              onClick={rematch}
              style={{ flex: 1.2, minWidth: '220px' }}
            >
              <RotateCcw size={18} /> Rematch (Same Players)
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={returnToLobby}
              style={{ flex: 1, minWidth: '180px' }}
            >
              Adjust Settings
            </button>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              padding: '1rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.925rem'
            }}
          >
            Waiting for the host to trigger a rematch or return to lobby...
          </div>
        )}

        <button
          className="btn btn-secondary btn-lg"
          onClick={() => setShowLeaveModal(true)}
        >
          <PlusCircle size={18} /> Create New Room
        </button>
      </div>
    </div>
  );
};
