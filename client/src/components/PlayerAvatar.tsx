import React from 'react';
import { Crown } from 'lucide-react';
import { getPlayerGradient, getPlayerInitials } from '../utils/avatar';

interface PlayerAvatarProps {
  nickname: string;
  size?: number;
  isHost?: boolean;
  connected?: boolean;
  showStatus?: boolean;
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  nickname,
  size = 40,
  isHost = false,
  connected = true,
  showStatus = false,
  className = ''
}) => {
  const [col1, col2] = getPlayerGradient(nickname);
  const initials = getPlayerInitials(nickname);

  return (
    <div
      className={`player-avatar-wrapper ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${col1}, ${col2})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: Math.max(11, Math.round(size * 0.38)),
          letterSpacing: '0.03em',
          boxShadow: `0 2px 10px ${col1}40`,
          border: '2px solid rgba(255, 255, 255, 0.15)',
          userSelect: 'none'
        }}
        title={nickname}
      >
        {initials}
      </div>

      {isHost && (
        <div
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#f59e0b',
            color: '#1a1000',
            borderRadius: '50%',
            width: Math.max(14, Math.round(size * 0.42)),
            height: Math.max(14, Math.round(size * 0.42)),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            border: '1.5px solid #0f1629'
          }}
          title="Room Host"
        >
          <Crown size={Math.max(8, Math.round(size * 0.26))} />
        </div>
      )}

      {showStatus && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.max(8, Math.round(size * 0.28)),
            height: Math.max(8, Math.round(size * 0.28)),
            borderRadius: '50%',
            background: connected ? '#10b981' : '#f43f5e',
            border: '2px solid #0f1629',
            boxShadow: connected ? '0 0 6px rgba(16, 185, 129, 0.6)' : 'none'
          }}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      )}
    </div>
  );
};
