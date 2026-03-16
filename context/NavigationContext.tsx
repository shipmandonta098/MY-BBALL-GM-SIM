
import React, { createContext, useContext } from 'react';
import { Player } from '../types';

interface NavigationContextValue {
  viewPlayer: (player: Player) => void;
  viewPlayerById: (id: string) => void;
  viewTeam: (teamId: string) => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  viewPlayer: () => {},
  viewPlayerById: () => {},
  viewTeam: () => {},
});

export const useNavigation = () => useContext(NavigationContext);
export const NavigationProvider = NavigationContext.Provider;

/** Clickable player name. Pass a full Player object, or just playerId + name. */
export const PlayerLink: React.FC<{
  player?: Player;
  playerId?: string;
  name: string;
  className?: string;
}> = ({ player, playerId, name, className = '' }) => {
  const { viewPlayer, viewPlayerById } = useNavigation();
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (player) viewPlayer(player);
    else if (playerId) viewPlayerById(playerId);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-left hover:text-amber-400 transition-colors cursor-pointer ${className}`}
    >
      {name}
    </button>
  );
};

/** Clickable team name. */
export const TeamLink: React.FC<{
  teamId: string;
  name: string;
  className?: string;
}> = ({ teamId, name, className = '' }) => {
  const { viewTeam } = useNavigation();
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); viewTeam(teamId); }}
      className={`text-left hover:text-amber-400 transition-colors cursor-pointer ${className}`}
    >
      {name}
    </button>
  );
};
