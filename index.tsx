
import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import LoadingScreen from './components/LoadingScreen';

const Root: React.FC = () => {
  const [appReady, setAppReady] = useState(false);
  const handleReady = useCallback(() => setAppReady(true), []);

  return (
    <ThemeProvider>
      <LoadingScreen ready={appReady} />
      <App onReady={handleReady} />
    </ThemeProvider>
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
