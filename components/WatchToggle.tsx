import React from 'react';

interface WatchToggleProps {
  playerId: string;
  watchList: string[];
  onToggle: (id: string) => void;
  className?: string;
}

const WatchToggle: React.FC<WatchToggleProps> = ({ playerId, watchList, onToggle, className = '' }) => {
  const watched = watchList.includes(playerId);
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(playerId); }}
      title={watched ? 'Remove from Watch List' : 'Add to Watch List'}
      className={`shrink-0 transition-all active:scale-90 ${watched ? 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]' : 'text-slate-700 hover:text-slate-400'} ${className}`}
    >
      {watched ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  );
};

export default WatchToggle;
