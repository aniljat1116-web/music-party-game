import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Copy,
  Link,
  Check,
  Trash2,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  AlertCircle,
  Music,
  Settings,
  ShieldAlert,
  Flame,
  Radio,
  Clock,
  Plus,
  FileAudio
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { PlayerAvatar } from './PlayerAvatar';
import { ConfirmationModal } from './ConfirmationModal';
import { AddSongModal } from './AddSongModal';
import { formatTime } from '../utils/formatTime';

export const Lobby: React.FC = () => {
  const {
    currentRoom,
    currentPlayer,
    players,
    songs,
    sessionToken,
    toggleReady,
    updateSettings,
    deleteSong,
    startGame,
    addToast,
    error,
    clearError
  } = useGame();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Audio preview state
  const [previewingSongId, setPreviewingSongId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Song delete confirmation
  const [songToDelete, setSongToDelete] = useState<{ id: string; name: string } | null>(null);

  // Ready-up countdown state
  const [autoStartCountdown, setAutoStartCountdown] = useState<number | null>(null);

  // Modern Add Track Modal state (Jamendo Search + File Upload)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const isHost = Boolean(currentPlayer?.is_host);
  const gameMode = currentRoom?.game_mode || 'who_added';
  const mySongs = songs.filter((s) => s.uploader_player_id === currentPlayer?.id);
  const totalSongs = songs.length;
  const requiredSongs = currentRoom?.total_rounds || 5;
  const enoughPlayers = players.length >= 3;
  const enoughSongs = totalSongs >= requiredSongs;
  const canStart = isHost && enoughPlayers && enoughSongs;
  const allPlayersReady = players.length >= 3 && players.every((p) => p.is_ready);

  // Auto-countdown when everyone is ready
  useEffect(() => {
    if (allPlayersReady && canStart) {
      setAutoStartCountdown(5);
    } else {
      setAutoStartCountdown(null);
    }
  }, [allPlayersReady, canStart]);

  useEffect(() => {
    if (autoStartCountdown === null) return;
    if (autoStartCountdown <= 0) {
      if (isHost) {
        startGame();
      }
      return;
    }

    const timer = setTimeout(() => {
      setAutoStartCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoStartCountdown, isHost, startGame]);

  if (!currentRoom || !currentPlayer) return null;

  // Audio preview handler
  const handleTogglePreview = (songId: string) => {
    if (previewingSongId === songId) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewingSongId(null);
    } else {
      setPreviewingSongId(songId);
      if (previewAudioRef.current && sessionToken) {
        previewAudioRef.current.src = `/api/rooms/${currentRoom.code}/audio/${songId}?token=${encodeURIComponent(sessionToken)}`;
        previewAudioRef.current.play().catch((err) => {
          console.warn('Preview error:', err);
          addToast('Could not preview track: Click "Enable Audio" first.', 'warning');
          setPreviewingSongId(null);
        });
      }
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentRoom.code);
    setCopiedCode(true);
    addToast(`Room code ${currentRoom.code} copied!`, 'info');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}?join=${currentRoom.code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    addToast('Invitation link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '1080px', margin: '0 auto', width: '100%' }}>
      {/* Hidden audio element for lobby preview */}
      <audio
        ref={previewAudioRef}
        onEnded={() => setPreviewingSongId(null)}
        onError={() => setPreviewingSongId(null)}
      />

      {/* Confirmation Modal for Song Deletion */}
      <ConfirmationModal
        isOpen={Boolean(songToDelete)}
        title="Remove Uploaded Song?"
        message={`Are you sure you want to remove "${songToDelete?.name}"? You can upload another track in its place before the match starts.`}
        confirmLabel="Remove Song"
        isDanger={true}
        onConfirm={() => {
          if (songToDelete) {
            deleteSong(songToDelete.id);
            if (previewingSongId === songToDelete.id) {
              handleTogglePreview(songToDelete.id);
            }
          }
        }}
        onCancel={() => setSongToDelete(null)}
      />

      {/* Auto-countdown banner when all players are ready */}
      {autoStartCountdown !== null && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.25))',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem 1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 30px rgba(16, 185, 129, 0.2)',
            animation: 'pulseGlow 1.5s infinite ease-in-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#10b981',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)'
              }}
            >
              {autoStartCountdown}
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399' }}>
                All Players Ready!
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Starting match automatically in {autoStartCountdown} seconds...
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => toggleReady(false)}
            >
              Cancel Auto-Start
            </button>
            {isHost && (
              <button className="btn btn-primary btn-sm" onClick={startGame}>
                Start Immediately
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Banner: Room Code, Game Mode, Quick Actions */}
      <div
        className="card card-glow"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1.25rem',
          padding: '1.5rem 1.75rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Room Code
            </span>
            <span className="badge badge-phase">
              {gameMode === 'guess_song' ? '🎯 Guess the Song Mode' : '🕵️ Who Added This Song?'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '2.2rem',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.18em',
                color: 'var(--cyan)',
                textShadow: '0 0 25px var(--cyan-glow)'
              }}
            >
              {currentRoom.code}
            </span>

            <button
              className="btn btn-sm btn-secondary"
              onClick={handleCopyCode}
              title="Copy 6-digit room code"
            >
              {copiedCode ? <Check size={15} color="var(--emerald)" /> : <Copy size={15} />}
              {copiedCode ? 'Code Copied!' : 'Copy Code'}
            </button>

            <button
              className="btn btn-sm btn-secondary"
              onClick={handleCopyLink}
              title="Copy direct invitation link"
            >
              {copiedLink ? <Check size={15} color="var(--emerald)" /> : <Link size={15} />}
              {copiedLink ? 'Link Copied!' : 'Copy Invite Link'}
            </button>
          </div>
        </div>

        {/* Ready toggle & Start game */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${currentPlayer.is_ready ? 'btn-secondary' : 'btn-cyan'}`}
            onClick={() => toggleReady(!currentPlayer.is_ready)}
            style={{ minWidth: '150px' }}
          >
            {currentPlayer.is_ready ? (
              <>
                <CheckCircle2 size={18} color="var(--emerald)" /> You're Ready
              </>
            ) : (
              <>
                <Circle size={18} /> Mark as Ready
              </>
            )}
          </button>

          {isHost && (
            <button
              className="btn btn-primary"
              onClick={startGame}
              disabled={!canStart}
              style={{ minWidth: '150px' }}
              title={
                !enoughPlayers
                  ? 'Need at least 3 players to start'
                  : !enoughSongs
                  ? `Need ${requiredSongs} songs to start (${totalSongs} uploaded)`
                  : 'Start Match'
              }
            >
              <Play size={18} /> Start Match
            </button>
          )}
        </div>
      </div>

      {/* Warnings & Validation Alerts */}
      {error && (
        <div className="error-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      {/* Requirements Status Checklist */}
      <div
        style={{
          background: 'rgba(15, 22, 41, 0.7)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '0.9rem 1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          fontSize: '0.9rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {enoughPlayers ? (
              <CheckCircle2 size={18} color="var(--emerald)" />
            ) : (
              <Circle size={18} color="var(--amber)" />
            )}
            <span>
              Players: <strong>{players.length}/3 min</strong>{' '}
              {!enoughPlayers && <span style={{ color: 'var(--amber)' }}>(need {3 - players.length} more)</span>}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {enoughSongs ? (
              <CheckCircle2 size={18} color="var(--emerald)" />
            ) : (
              <Circle size={18} color="var(--amber)" />
            )}
            <span>
              Eligible Songs: <strong>{totalSongs}/{requiredSongs} required</strong>{' '}
              {!enoughSongs && <span style={{ color: 'var(--amber)' }}>(need {requiredSongs - totalSongs} more)</span>}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isHost ? 'Only host can start the match when ready.' : 'Waiting for host to launch the match.'}
        </div>
      </div>

      {/* Main Grid: Left = Players & Settings, Right = Song Uploads */}
      <div className="grid-2">
        {/* Left Column: Players list & Host Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Players Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={18} color="var(--cyan)" /> Connected Players ({players.length}/10)
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {players.map((p) => {
                const pSongs = songs.filter((s) => s.uploader_player_id === p.id);
                const isMe = p.id === currentPlayer.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: isMe ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: isMe ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <PlayerAvatar
                        nickname={p.nickname}
                        isHost={p.is_host}
                        connected={p.connected}
                        showStatus={true}
                        size={36}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.nickname}</span>
                          {isMe && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(You)</span>}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {p.is_host ? '👑 Room Leader' : p.connected ? 'Online' : 'Disconnected'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: pSongs.length > 0 ? 'var(--cyan)' : 'var(--text-muted)',
                          fontWeight: 600
                        }}
                      >
                        🎵 {pSongs.length}/3 songs
                      </span>
                      {p.is_ready ? (
                        <span className="badge badge-ready">Ready</span>
                      ) : (
                        <span className="badge badge-not-ready">Waiting</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host Room Settings */}
          {isHost && (
            <div className="card">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <Settings size={18} color="var(--primary)" /> Game Settings (Host Controls)
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Game Mode Switcher */}
                <div>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Flame size={16} color="var(--cyan)" /> Game Mode:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${gameMode === 'who_added' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => updateSettings(currentRoom.total_rounds, currentRoom.discussion_duration, 'who_added', currentRoom.clip_duration)}
                      style={{ flexDirection: 'column', padding: '0.75rem 0.5rem', height: 'auto' }}
                    >
                      <span style={{ fontWeight: 700 }}>Who Added This?</span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '2px' }}>Guess the uploader</span>
                    </button>

                    <button
                      type="button"
                      className={`btn btn-sm ${gameMode === 'guess_song' ? 'btn-cyan' : 'btn-secondary'}`}
                      onClick={() => updateSettings(currentRoom.total_rounds, currentRoom.discussion_duration, 'guess_song', currentRoom.clip_duration)}
                      style={{ flexDirection: 'column', padding: '0.75rem 0.5rem', height: 'auto' }}
                    >
                      <span style={{ fontWeight: 700 }}>Guess the Song</span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '2px' }}>Guess title & artist</span>
                    </button>
                  </div>
                </div>

                {/* Song Clip Duration */}
                <div>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Radio size={16} color="var(--primary)" /> Audio Clip Length:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                    {[15, 30, 45, 60].map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        className={`btn btn-sm ${(currentRoom.clip_duration || 30) === dur ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateSettings(currentRoom.total_rounds, currentRoom.discussion_duration, gameMode, dur)}
                      >
                        {dur}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discussion Duration */}
                <div>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={16} color="var(--cyan)" /> Discussion Time:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                    {[60, 120, 180, 300].map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        className={`btn btn-sm ${currentRoom.discussion_duration === dur ? 'btn-cyan' : 'btn-secondary'}`}
                        onClick={() => updateSettings(currentRoom.total_rounds, dur, gameMode, currentRoom.clip_duration)}
                      >
                        {dur >= 60 ? `${dur / 60}m` : `${dur}s`}{dur === 300 ? ' (5m)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Total Rounds */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <label className="form-label">
                      Total Rounds:
                    </label>
                    <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                      {currentRoom.total_rounds} rounds
                    </strong>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    value={currentRoom.total_rounds}
                    onChange={(e) => updateSettings(parseInt(e.target.value, 10), currentRoom.discussion_duration, gameMode, currentRoom.clip_duration)}
                    style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>3 (Quick)</span>
                    <span>10 (Standard)</span>
                    <span>20 (Epic)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Song Queue & Modern Add Song Interface */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Add Song Modal */}
          <AddSongModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            mySongs={mySongs}
            maxSongs={3}
          />

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <Music size={18} color="var(--primary)" /> Your Song Queue ({mySongs.length}/3)
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Choose up to 3 tracks to play during the game. Search Jamendo's catalog or upload your own files.
                </p>
              </div>
            </div>

            {/* Add Track Action Button */}
            {mySongs.length < 3 ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => setIsAddModalOpen(true)}
                style={{ width: '100%', margin: '1rem 0 1.25rem', gap: '0.65rem' }}
              >
                <Plus size={20} /> Add Track (YouTube, Jamendo, or Upload)
              </button>
            ) : (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: 'var(--emerald)',
                  fontSize: '0.85rem',
                  margin: '0.75rem 0 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <CheckCircle2 size={16} /> Maximum 3 songs added! Your queue is ready for the match.
              </div>
            )}

            {/* List of uploaded songs with In-Lobby Audio Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {mySongs.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem 1.5rem',
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.01)'
                  }}
                >
                  <Music size={32} color="var(--text-muted)" style={{ margin: '0 auto 0.65rem' }} />
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    No tracks in your queue yet
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>
                    Click the button above to search Jamendo or upload an audio file.
                  </p>
                </div>
              ) : (
                mySongs.map((s) => {
                  const isPreviewing = previewingSongId === s.id;
                  const isJamendo = s.source_type === 'jamendo';
                  const isYouTube = s.source_type === 'youtube';

                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        background: isPreviewing ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                        border: isPreviewing ? '1px solid var(--border-cyan)' : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1 }}>
                        {/* Audio Preview Button */}
                        {!isYouTube ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleTogglePreview(s.id)}
                            style={{
                              padding: '0.45rem',
                              color: isPreviewing ? 'var(--cyan)' : 'var(--text-main)',
                              borderRadius: '50%',
                              flexShrink: 0
                            }}
                            title={isPreviewing ? 'Stop Preview' : 'Preview Track'}
                          >
                            {isPreviewing ? <Pause size={17} /> : <Play size={17} />}
                          </button>
                        ) : (
                          <div
                            style={{
                              padding: '0.45rem',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                            title="YouTube video will play synchronously in game round"
                          >
                            <Play size={17} />
                          </div>
                        )}

                        {/* Thumbnail Artwork or File Icon */}
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                            background: 'var(--bg-surface-elevated)',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          {s.artwork_url ? (
                            <img
                              src={s.artwork_url}
                              alt={s.title || ''}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : isJamendo ? (
                            <Music size={20} color="var(--cyan)" />
                          ) : (
                            <FileAudio size={20} color="var(--primary)" />
                          )}
                        </div>

                        {/* Song Meta */}
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: 'var(--text-main)'
                            }}
                          >
                            {s.title || s.original_filename}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.artist ? `${s.artist} • ` : ''}
                              {isJamendo || isYouTube
                                ? `${formatTime(s.duration_seconds || 30)}`
                                : `${(s.file_size / (1024 * 1024)).toFixed(1)} MB`}
                            </span>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.65rem',
                                padding: '0.15rem 0.45rem',
                                background: isYouTube
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : isJamendo
                                    ? 'rgba(6, 182, 212, 0.15)'
                                    : 'rgba(139, 92, 246, 0.15)',
                                color: isYouTube
                                  ? '#f87171'
                                  : isJamendo
                                    ? 'var(--cyan)'
                                    : 'var(--primary)',
                                border: isYouTube
                                  ? '1px solid rgba(239, 68, 68, 0.35)'
                                  : isJamendo
                                    ? '1px solid var(--border-cyan)'
                                    : '1px solid var(--border-accent)'
                              }}
                            >
                              {isYouTube ? 'YouTube' : isJamendo ? 'Jamendo' : 'Upload'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSongToDelete({ id: s.id, name: s.title || s.original_filename })}
                        title="Remove Song"
                        style={{ color: 'var(--rose)', padding: '0.4rem', flexShrink: 0 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Music Guidelines Notice */}
            <div
              style={{
                marginTop: '1.25rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: 1.4
              }}
            >
              <ShieldAlert size={16} color="var(--amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                <strong>Music Guidelines:</strong> Search songs via YouTube, explore Jamendo music, or upload your own audio files. Official players and secure synchronization enabled.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
