import React, { useState, useEffect } from 'react';
import { WifiOff, AlertTriangle, Volume2 } from 'lucide-react';
import { GameProvider, useGame } from './context/GameContext';
import { Navbar } from './components/Navbar';
import { Landing } from './components/Landing';
import { CreateRoom } from './components/CreateRoom';
import { JoinRoom } from './components/JoinRoom';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';
import { FinalResults } from './components/FinalResults';
import { ToastContainer } from './components/ToastContainer';

type ScreenView = 'landing' | 'create' | 'join';

const AppContent: React.FC = () => {
  const {
    currentRoom,
    connected,
    connecting,
    sessionToken,
    audioUnlocked,
    handleUnlockAudio,
    error,
    clearError,
    leaveRoom
  } = useGame();

  const [initialJoinCode, setInitialJoinCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('join') || '').toUpperCase();
  });

  const [view, setView] = useState<ScreenView>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join') ? 'join' : 'landing';
  });

  // Clean invitation query parameter from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('join')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // If player is in a room, render appropriate game screen
  const renderRoomContent = () => {
    if (!currentRoom) return null;

    if (currentRoom.status === 'lobby') {
      return <Lobby />;
    }

    if (currentRoom.status === 'playing') {
      return <GameScreen />;
    }

    if (currentRoom.status === 'finished') {
      return (
        <FinalResults
          onCreateNewRoom={() => {
            leaveRoom();
            setView('create');
          }}
        />
      );
    }

    return <Lobby />;
  };

  return (
    <div className="app-container">
      {/* Global Toast Notifications Container */}
      <ToastContainer />

      {/* Reconnection Status Banner */}
      {!connected && sessionToken && (
        <div className="reconnect-banner">
          <WifiOff size={16} />
          <span>
            {connecting
              ? 'Reconnecting to game session...'
              : 'Connection lost. Retrying server connection...'}
          </span>
        </div>
      )}

      {/* Navbar */}
      <Navbar onNavigateHome={() => setView('landing')} />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Global Error Alert Banner */}
        {error && (
          <div className="error-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}

        {/* Browser Audio Unlock Prompt Banner */}
        {!audioUnlocked && currentRoom && (
          <div className="audio-unlock-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Volume2 size={20} color="var(--cyan)" />
              <span style={{ fontSize: '0.9rem' }}>
                Browsers require permission before streaming synchronized audio.
              </span>
            </div>
            <button className="btn btn-sm btn-cyan" onClick={handleUnlockAudio}>
              Enable Synchronized Audio
            </button>
          </div>
        )}

        {/* Screen Routing */}
        {currentRoom ? (
          renderRoomContent()
        ) : (
          <>
            {view === 'landing' && (
              <Landing
                onCreateClick={() => setView('create')}
                onJoinClick={() => {
                  setInitialJoinCode('');
                  setView('join');
                }}
              />
            )}
            {view === 'create' && <CreateRoom onBack={() => setView('landing')} />}
            {view === 'join' && (
              <JoinRoom
                initialCode={initialJoinCode}
                onBack={() => setView('landing')}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
};

export default App;
