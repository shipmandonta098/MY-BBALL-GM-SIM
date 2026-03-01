import React from 'react';
import { Team, Player } from '../types';

interface MarketProps {
  teams: Team[];
  userTeamId: string;
  onScout: (player: Player) => void;
  scoutingReport: { playerId: string; report: string } | null;
  onViewRoster: (teamId: string) => void;
}

const Market: React.FC<MarketProps> = ({ teams, userTeamId, onScout, scoutingReport, onViewRoster }) => {
  // Combine some non-user team players to simulate a market
  const allOtherPlayers = teams
    .filter(t => t.id !== userTeamId)
    .flatMap(t => t.roster.map(p => ({ ...p, teamId: t.id })))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl mb-8">
        <h2 className="text-2xl font-display font-bold text-emerald-400 mb-2">Transfer Market</h2>
        <p className="text-emerald-500/70">Scout top prospects from around the league. These players are available for potential trades or future signings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {allOtherPlayers.map(player => (
          <div key={player.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center hover:border-slate-700 transition-colors">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center font-display font-bold text-xl text-slate-500">
                {player.position}
            </div>
            <div className="flex-1">
                <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg">{player.name}</h3>
                    <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400 uppercase">{player.position}</span>
                </div>
                <div className="flex gap-4 text-sm text-slate-500 mt-1">
                    <span>Rating: <strong className="text-amber-500">{player.rating}</strong></span>
                    <span>Value: <strong className="text-emerald-500">${(player.salary / 1000000).toFixed(1)}M</strong></span>
                    <span>Age: {player.age}</span>
                </div>
            </div>
            <div className="flex gap-2">
                <button 
                  onClick={() => onScout(player)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-all"
                >
                    Scout
                </button>
                <button 
                  onClick={() => onViewRoster(player.teamId)}
                  className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-slate-950 rounded-lg text-xs font-bold transition-all border border-amber-500/20"
                >
                    Team Roster
                </button>
            </div>
            
            {scoutingReport?.playerId === player.id && (
              <div className="w-full mt-4 md:mt-0 p-4 bg-slate-950 rounded-xl border border-amber-500/20 text-xs text-slate-400 leading-relaxed italic md:absolute md:z-20 md:w-80 md:right-0">
                <p className="font-bold text-amber-500 mb-2 uppercase tracking-widest text-[10px]">Advanced Analysis</p>
                <div className="whitespace-pre-line">{scoutingReport.report}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Market;