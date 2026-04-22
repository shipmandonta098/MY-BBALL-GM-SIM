
import React, { useState, useCallback, Component } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import LoadingScreen from './components/LoadingScreen';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Hoops Dynasty] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: '#0f172a',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', color: '#f8fafc', fontFamily: 'Inter, sans-serif',
          padding: '2rem', textAlign: 'center', gap: '1.5rem',
        }}>
          <div style={{ fontSize: '3rem' }}>🏀</div>
          <h2 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '1.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Something Went Wrong
          </h2>
          <p style={{ color: '#94a3b8', maxWidth: 400, lineHeight: 1.6, margin: 0, fontSize: '0.9rem' }}>
            The game hit an unexpected error. Your save data is safe — reload to continue.
          </p>
          {this.state.error && (
            <p style={{ color: '#475569', fontSize: '0.75rem', fontFamily: 'monospace', maxWidth: 500, wordBreak: 'break-all', margin: 0 }}>
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.875rem 2.5rem', backgroundColor: '#f97316', color: '#0f172a',
              border: 'none', borderRadius: '0.75rem', fontFamily: 'Oswald, sans-serif',
              fontWeight: 700, fontSize: '1rem', textTransform: 'uppercase',
              letterSpacing: '0.1em', cursor: 'pointer',
            }}
          >
            Reload Game
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Root: React.FC = () => {
  const [appReady, setAppReady] = useState(false);
  const handleReady = useCallback(() => setAppReady(true), []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LoadingScreen ready={appReady} />
        <App onReady={handleReady} />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
