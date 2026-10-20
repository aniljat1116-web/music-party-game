import React, { useState } from 'react';
import { ArrowLeft, LogIn, KeyRound, User } from 'lucide-react';
import { useGame } from '../context/GameContext';

interface JoinRoomProps {
  onBack: () => void;
  initialCode?: string;
}

export const JoinRoom: React.FC<JoinRoomProps> = ({ onBack, initialCode = '' }) => {
  const { joinRoom, error, clearError } = useGame();
  const [roomCode, setRoomCode] = useState(initialCode.toUpperCase());
  const [nickname, setNickname] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !nickname.trim() || isSubmitting) return;

    setIsSubmitting(true);
    clearError();
    await joinRoom(roomCode.trim().toUpperCase(), nickname.trim());
    setIsSubmitting(false);
  };

  return (
    <div style={{ maxWidth: '460px', margin: '2rem auto', width: '100%' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ marginBottom: '1.25rem' }}
      >
        <ArrowLeft size={16} /> Back to Home
      </button>

      <div className="card card-glow" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          Join a Room
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
          Enter the 6-character room code shared by your friend.
        </p>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Room Code */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="roomCode" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <KeyRound size={16} color="var(--cyan)" /> Room Code
            </label>
            <input
              id="roomCode"
              className="form-input code-input"
              type="text"
              placeholder="e.g. AB12CD"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
              autoFocus
            />
          </div>

          {/* Nickname */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="joinNickname" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={16} color="var(--primary)" /> Your Nickname
            </label>
            <input
              id="joinNickname"
              className="form-input"
              type="text"
              placeholder="e.g. MelodyQueen, StarGazer"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              minLength={2}
              maxLength={20}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-cyan btn-lg"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={!roomCode.trim() || !nickname.trim() || isSubmitting}
          >
            <LogIn size={18} />
            {isSubmitting ? 'Joining Room...' : 'Enter Room'}
          </button>
        </form>
      </div>
    </div>
  );
};
