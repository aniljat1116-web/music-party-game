import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

const REACTION_EMOJIS = ['🔥', '💃', '🎵', '🤔', '😱', '👏', '🎉', '❤️'];

export const ReactionsBar: React.FC = () => {
  const { sendReaction, reactions } = useGame();
  const [cooldown, setCooldown] = useState(false);

  const handleReact = (emoji: string) => {
    if (cooldown) return;
    sendReaction(emoji);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1200);
  };

  return (
    <>
      {/* Floating Reaction Bubbles Overlay */}
      <div
        style={{
          position: 'fixed',
          bottom: '5rem',
          right: '2rem',
          width: '260px',
          height: '320px',
          pointerEvents: 'none',
          zIndex: 35,
          overflow: 'hidden'
        }}
        aria-hidden="true"
      >
        {reactions.map((r) => (
          <div
            key={r.id}
            className="floating-reaction"
            style={{
              position: 'absolute',
              bottom: '10px',
              right: `${Math.floor((r.timestamp % 5) * 40 + 10)}px`,
              background: 'rgba(15, 22, 41, 0.9)',
              border: '1px solid var(--border-accent)',
              borderRadius: 'var(--radius-full)',
              padding: '0.35rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)',
              animation: 'floatUp 2.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
            }}
          >
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{r.emoji}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {r.nickname}
            </span>
          </div>
        ))}
      </div>

      {/* Emoji Buttons Row */}
      <div
        className="reactions-bar-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(15, 22, 41, 0.8)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)',
          width: 'fit-content',
          margin: '0 auto'
        }}
      >
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.25rem', paddingRight: '0.25rem' }}>
          React:
        </span>
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleReact(emoji)}
            disabled={cooldown}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: cooldown ? 'not-allowed' : 'pointer',
              opacity: cooldown ? 0.5 : 1,
              transition: 'transform 0.15s ease, background 0.15s ease'
            }}
            className="reaction-btn"
            title={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
};
