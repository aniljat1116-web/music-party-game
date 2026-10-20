import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Clock, Layers, Flame, Radio } from 'lucide-react';
import { useGame } from '../context/GameContext';
import type { GameMode } from '../types';

interface CreateRoomProps {
  onBack: () => void;
}

export const CreateRoom: React.FC<CreateRoomProps> = ({ onBack }) => {
  const { createRoom, error, clearError } = useGame();
  const [nickname, setNickname] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('who_added');
  const [discussionDuration, setDiscussionDuration] = useState<number>(300);
  const [clipDuration, setClipDuration] = useState<number>(30);
  const [totalRounds, setTotalRounds] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || isSubmitting) return;

    setIsSubmitting(true);
    clearError();
    await createRoom(nickname.trim(), discussionDuration, totalRounds, gameMode, clipDuration);
    setIsSubmitting(false);
  };

  return (
    <div style={{ maxWidth: '520px', margin: '1.5rem auto', width: '100%' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ marginBottom: '1.25rem' }}
      >
        <ArrowLeft size={16} /> Back to Home
      </button>

      <div className="card card-glow" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          Create a New Room
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
          You will be the room leader and can configure settings and start the match.
        </p>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Nickname */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="createNickname">
              Your Nickname
            </label>
            <input
              id="createNickname"
              className="form-input"
              type="text"
              placeholder="e.g. BeatMaster, VinylVixen"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              minLength={2}
              maxLength={20}
              required
              autoFocus
            />
          </div>

          {/* Game Mode Selection */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Flame size={16} color="var(--primary)" /> Game Mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              <button
                type="button"
                className={`btn ${gameMode === 'who_added' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGameMode('who_added')}
                style={{ flexDirection: 'column', padding: '0.85rem 0.6rem', textAlign: 'center' }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Who Added This?</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '2px' }}>Guess the uploader</span>
              </button>

              <button
                type="button"
                className={`btn ${gameMode === 'guess_song' ? 'btn-cyan' : 'btn-secondary'}`}
                onClick={() => setGameMode('guess_song')}
                style={{ flexDirection: 'column', padding: '0.85rem 0.6rem', textAlign: 'center' }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Guess the Song</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '2px' }}>Guess title & artist</span>
              </button>
            </div>
          </div>

          {/* Clip Duration Selection */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Radio size={16} color="var(--cyan)" /> Audio Clip Length
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {[15, 30, 45, 60].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  className={`btn btn-sm ${clipDuration === dur ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setClipDuration(dur)}
                >
                  {dur}s
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              How many seconds of each song are played before discussion.
            </span>
          </div>

          {/* Discussion Duration */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} color="var(--primary)" /> Discussion Time
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {[60, 120, 180, 300].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  className={`btn btn-sm ${discussionDuration === dur ? 'btn-cyan' : 'btn-secondary'}`}
                  onClick={() => setDiscussionDuration(dur)}
                >
                  {dur >= 60 ? `${dur / 60}m` : `${dur}s`}{dur === 300 ? ' (5:00)' : ''}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Official round timer is 5 minutes (05:00) by default. Players can vote to skip when ready.
            </span>
          </div>

          {/* Number of Rounds */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={16} /> Total Rounds
              </label>
              <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                {totalRounds} rounds
              </strong>
            </div>
            <input
              type="range"
              min="3"
              max="20"
              value={totalRounds}
              onChange={(e) => setTotalRounds(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                accentColor: 'var(--primary)',
                cursor: 'pointer',
                marginTop: '0.25rem'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>3 (Quick)</span>
              <span>10 (Standard)</span>
              <span>20 (Epic)</span>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={!nickname.trim() || isSubmitting}
          >
            <Sparkles size={18} />
            {isSubmitting ? 'Creating Room...' : 'Create & Enter Lobby'}
          </button>
        </form>
      </div>
    </div>
  );
};
