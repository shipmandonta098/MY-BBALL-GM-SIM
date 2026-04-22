
import React, { useEffect, useState } from 'react';

interface Props {
  ready: boolean;
}

const LoadingScreen: React.FC<Props> = ({ ready }) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const splash = document.getElementById('hd-splash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.pointerEvents = 'none';
      setTimeout(() => splash.remove(), 300);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    setFading(true);
    const t = setTimeout(() => setVisible(false), 480);
    return () => clearTimeout(t);
  }, [ready]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes hd-bounce {
          from { transform: translateY(0); }
          to   { transform: translateY(-20px); }
        }
        @keyframes hd-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          backgroundColor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: fading ? 0 : 1,
          transition: 'opacity 480ms ease',
          pointerEvents: fading ? 'none' : 'auto',
        }}
      >
        <div style={{ animation: 'hd-bounce 0.72s ease-in-out infinite alternate', marginBottom: 28 }}>
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="30" cy="30" r="28" fill="url(#bball-grad)" stroke="#7c2d12" strokeWidth="2.5"/>
            <path d="M30 2 C30 2 30 58 30 58" stroke="#7c2d12" strokeWidth="1.8" fill="none"/>
            <path d="M2 30 C2 30 58 30 58 30" stroke="#7c2d12" strokeWidth="1.8" fill="none"/>
            <path d="M7 13 Q30 24 53 13" stroke="#7c2d12" strokeWidth="1.6" fill="none"/>
            <path d="M7 47 Q30 36 53 47" stroke="#7c2d12" strokeWidth="1.6" fill="none"/>
            <defs>
              <radialGradient id="bball-grad" cx="38%" cy="35%" r="62%">
                <stop offset="0%" stopColor="#fb923c"/>
                <stop offset="100%" stopColor="#c2410c"/>
              </radialGradient>
            </defs>
          </svg>
        </div>

        <div style={{
          fontFamily: "'Oswald', 'Impact', sans-serif",
          fontSize: '2rem',
          fontWeight: 700,
          color: '#f8fafc',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Hoops Dynasty
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.8125rem',
          color: '#475569',
          marginTop: 6,
          letterSpacing: '0.03em',
        }}>
          Loading your franchise…
        </div>

        <div style={{
          width: 128,
          height: 3,
          backgroundColor: '#1e293b',
          borderRadius: 4,
          marginTop: 28,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '45%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, #f97316, transparent)',
            borderRadius: 4,
            animation: 'hd-shimmer 1.3s ease-in-out infinite',
          }} />
        </div>
      </div>
    </>
  );
};

export default LoadingScreen;
