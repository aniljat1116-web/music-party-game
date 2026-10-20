import React from 'react';
import { PlusCircle, LogIn, Headphones, Award, ShieldCheck, Flame } from 'lucide-react';

interface LandingProps {
  onCreateClick: () => void;
  onJoinClick: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onCreateClick, onJoinClick }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem', margin: 'auto 0' }}>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          className="badge badge-phase"
          style={{ marginBottom: '1.5rem', padding: '0.45rem 1.15rem', fontSize: '0.875rem' }}
        >
          🎵 Real-time Multiplayer Music Battle
        </div>

        <h1
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '1.25rem',
            background: 'linear-gradient(135deg, #ffffff 30%, #c084fc 70%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          Who Added This Song?
        </h1>

        <p
          style={{
            fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '2rem',
            maxWidth: '680px'
          }}
        >
          Gather your friends in private rooms, upload your secret favorite tracks, listen synchronously,
          and guess who added each song — or guess the track title and artist!
        </p>

        {/* Animated Sound-Wave Visual Motif */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '42px',
            marginBottom: '2.5rem',
            padding: '0.5rem 1.5rem',
            background: 'rgba(15, 22, 41, 0.6)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)'
          }}
          aria-hidden="true"
        >
          {[40, 75, 25, 90, 60, 100, 45, 80, 30, 95, 50, 70, 85, 35, 65].map((h, i) => (
            <div
              key={i}
              style={{
                width: '4px',
                height: `${h}%`,
                background: 'linear-gradient(to top, var(--cyan), var(--primary))',
                borderRadius: '4px',
                animation: `bounceBar 1.2s ease-in-out infinite`,
                animationDelay: `${(i * 0.08).toFixed(2)}s`
              }}
            />
          ))}
        </div>

        {/* Hero Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '1rem',
            width: '100%'
          }}
        >
          <button className="btn btn-lg btn-primary" onClick={onCreateClick} style={{ minWidth: '190px' }}>
            <PlusCircle size={20} /> Create Room
          </button>
          <button className="btn btn-lg btn-cyan" onClick={onJoinClick} style={{ minWidth: '190px' }}>
            <LogIn size={20} /> Join with Code
          </button>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="grid-3">
        <div className="card">
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(139, 92, 246, 0.15)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}
          >
            <Headphones size={24} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Synchronized Playback
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6 }}>
            Listen to identical audio clips with live reactive spectrum visualizers across everyone's phones and laptops simultaneously.
          </p>
        </div>

        <div className="card">
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}
          >
            <Flame size={24} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Two Game Modes
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6 }}>
            Play the original <strong>"Who Added This?"</strong> to unmask the uploader, or switch to <strong>"Guess the Song"</strong> for pure music trivia.
          </p>
        </div>

        <div className="card">
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}
          >
            <Award size={24} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Podium & Live Reactions
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6 }}>
            Send real-time floating emoji reactions during discussion, unmask dramatic reveals, and crown the champion on the winner podium!
          </p>
        </div>
      </section>

      {/* How To Play Section */}
      <section className="card" style={{ padding: '2.5rem 2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '2rem' }}>
          How To Play In 3 Simple Steps
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1rem'
              }}
            >
              1
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Create Room & Upload</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Create a room, share the 6-character room code with friends, and upload 1-3 favorite audio files.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1rem'
              }}
            >
              2
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Listen & Interrogate</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Everyone listens to the exact same audio clip. Debate, react with live emojis, and discuss whose song it might be.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1rem'
              }}
            >
              3
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Vote & Reveal</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Submit your private guess before time runs out. The server scores the round, reveals the uploader, and celebrates the winner!
            </p>
          </div>
        </div>
      </section>

      {/* Security & Copyright Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          maxWidth: '840px',
          margin: '0 auto',
          lineHeight: 1.5
        }}
      >
        <ShieldCheck size={22} color="var(--cyan)" style={{ flexShrink: 0 }} />
        <span>
          Private sessions for up to 10 players. No accounts or passwords required.
          Audio streams securely within your room. Please ensure you have permission to share any uploaded music.
        </span>
      </div>
    </div>
  );
};
