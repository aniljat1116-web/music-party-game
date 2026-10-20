import React, { useState } from 'react';
import { Music, LogOut, Copy, Check, Volume2 } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { PlayerAvatar } from './PlayerAvatar';
import { ConfirmationModal } from './ConfirmationModal';

interface NavbarProps {
  onNavigateHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigateHome }) => {
  const { currentRoom, currentPlayer, leaveRoom, audioUnlocked, handleUnlockAudio, addToast } = useGame();
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const handleCopyCode = () => {
    if (currentRoom) {
      navigator.clipboard.writeText(currentRoom.code);
      setCopied(true);
      addToast(`Room code ${currentRoom.code} copied!`, 'info');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <ConfirmationModal
        isOpen={showLeaveConfirm}
        title="Leave Room?"
        message="Are you sure you want to leave this room? If you leave during an active match, your score will be forfeited."
        confirmLabel="Leave Room"
        isDanger={true}
        onConfirm={leaveRoom}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      <header className="navbar">
        <div className="brand" onClick={onNavigateHome}>
          <div className="brand-icon">
            <Music size={20} />
          </div>
          <span style={{ background: 'linear-gradient(135deg, #ffffff, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Who Added This Song?
          </span>
        </div>

        <div className="navbar-actions">
          {!audioUnlocked && (
            <button
              className="btn btn-sm btn-cyan"
              onClick={handleUnlockAudio}
              title="Enable synchronized audio playback in browser"
            >
              <Volume2 size={15} /> Enable Audio
            </button>
          )}

          {currentRoom && currentPlayer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {/* Room Code Badge */}
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={handleCopyCode}
                title="Click to copy Room Code"
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', gap: '0.35rem' }}
              >
                <span>ROOM: <strong>{currentRoom.code}</strong></span>
                {copied ? <Check size={14} color="var(--emerald)" /> : <Copy size={13} />}
              </button>

              {/* Player Avatar & Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <PlayerAvatar nickname={currentPlayer.nickname} size={30} isHost={currentPlayer.is_host} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{currentPlayer.nickname}</span>
              </div>

              {/* Leave Room Button */}
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setShowLeaveConfirm(true)}
                title="Leave Room"
                style={{ padding: '0.4rem 0.6rem' }}
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
};
