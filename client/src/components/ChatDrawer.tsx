import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { PlayerAvatar } from './PlayerAvatar';

export const ChatDrawer: React.FC = () => {
  const { chatMessages, sendChatMessage, currentPlayer } = useGame();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendChatMessage(text.trim());
    setText('');
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        className="btn btn-secondary"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 40,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
          borderRadius: 'var(--radius-full)',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          border: '1px solid var(--border-accent)',
          background: 'rgba(15, 22, 41, 0.95)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <MessageSquare size={18} color="var(--cyan)" />
        <span style={{ fontWeight: 700 }}>Chat</span>
        {chatMessages.length > 0 && (
          <span
            style={{
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 800,
              padding: '0.1rem 0.45rem',
              borderRadius: 'var(--radius-full)'
            }}
          >
            {chatMessages.length}
          </span>
        )}
      </button>

      {/* Chat Panel / Drawer */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '5.5rem',
            right: '1.5rem',
            width: 'min(380px, calc(100vw - 3rem))',
            height: '440px',
            background: 'rgba(15, 22, 41, 0.96)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 45,
            overflow: 'hidden',
            animation: 'modalFadeIn 0.2s ease-out'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1.15rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <MessageSquare size={18} color="var(--cyan)" />
              <span>Room Chat ({chatMessages.length})</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setIsOpen(false)}
              style={{ padding: '0.25rem' }}
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages List */}
          <div
            style={{
              flex: 1,
              padding: '1rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}
          >
            {chatMessages.length === 0 ? (
              <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
                No messages yet. Interrogate your friends or drop your thoughts!
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMe = msg.player_id === currentPlayer?.id;
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      display: 'flex',
                      flexDirection: isMe ? 'row-reverse' : 'row',
                      alignItems: 'flex-start',
                      gap: '0.5rem'
                    }}
                  >
                    {!isMe && (
                      <PlayerAvatar nickname={msg.nickname} size={26} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      {!isMe && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 600 }}>
                          {msg.nickname}
                        </span>
                      )}
                      <div
                        style={{
                          padding: '0.55rem 0.9rem',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '0.875rem',
                          lineHeight: 1.4,
                          background: isMe
                            ? 'linear-gradient(135deg, var(--primary), #7c3aed)'
                            : 'rgba(255, 255, 255, 0.08)',
                          color: '#fff',
                          wordBreak: 'break-word',
                          boxShadow: isMe ? '0 2px 10px var(--primary-glow)' : 'none'
                        }}
                      >
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSend}
            style={{
              padding: '0.75rem 1rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              gap: '0.5rem',
              background: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="Type your message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              style={{ flex: 1, padding: '0.55rem 0.85rem', fontSize: '0.875rem' }}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!text.trim()}
              style={{ padding: '0.55rem 0.85rem' }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
