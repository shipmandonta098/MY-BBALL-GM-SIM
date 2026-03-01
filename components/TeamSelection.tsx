import React, { useState } from 'react';
import { Team } from '../types';
import TeamBadge from './TeamBadge';

interface TeamSelectionProps {
  teams: Team[];
  onSelectTeam: (teamId: string) => void;
}

const TeamSelection: React.FC<TeamSelectionProps> = ({ teams, onSelectTeam }) => {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);

  const getTeamRating = (team: Team) => {
    const avg = team.roster.reduce((sum, p) => sum + p.rating, 0) / team.roster.length;
    return Math.round(avg);
  };

  const marketColors = {
    Large: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    Medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Small: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  };

  return (
    <div className="fixed inset-0 bg-slate-950 overflow-y-auto p-8 z-[110] animate-in fade-in duration-700">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-12 text-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-6 z-20 border-b border-slate-800/50">
            <h2 className="text-6xl font-display font-bold uppercase tracking-tighter text-white mb-2">
              Select Your <span className="text-amber-500">Franchise</span>
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Choose a team to lead to the championship. Experience unique team branding throughout your career.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-20">
          {teams.map((team) => {
            const rating = getTeamRating(team);
            const isHovered = hoveredTeam === team.id;
            
            return (
              <button
                key={team.id}
                onClick={() => onSelectTeam(team.id)}
                onMouseEnter={() => setHoveredTeam(team.id)}
                onMouseLeave={() => setHoveredTeam(null)}
                className={`relative flex flex-col items-center p-6 bg-slate-900 border border-slate-800 rounded-2xl transition-all group hover:scale-[1.03] active:scale-95 overflow-hidden text-left ${
                  isHovered ? 'ring-2 shadow-2xl' : ''
                }`}
                style={isHovered ? { 
                  borderColor: team.primaryColor,
                  boxShadow: `0 0 40px ${team.primaryColor}1a`
                } : {}}
              >
                {/* Background Pattern */}
                <div 
                  className={`absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full blur-3xl transition-opacity duration-500 ${isHovered ? 'opacity-30' : 'opacity-0'}`}
                  style={{ backgroundColor: team.primaryColor }}
                ></div>
                
                {/* Header info */}
                <div className="w-full flex justify-between items-start mb-4">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${marketColors[team.marketSize]}`}>
                    {team.marketSize} Market
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">{team.conference}</span>
                  </div>
                </div>

                <div 
                  className="w-24 h-24 mb-6 rounded-2xl overflow-hidden bg-slate-800 border-2 flex items-center justify-center transition-transform group-hover:rotate-3 shadow-inner"
                  style={{ borderColor: team.secondaryColor }}
                >
                    <TeamBadge team={team} size="xl" />
                </div>
                
                <div className="text-center mb-6 w-full">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1">{team.city}</p>
                  <h3 className="font-display font-bold text-3xl uppercase text-white transition-colors leading-none" style={isHovered ? { color: team.primaryColor } : {}}>{team.name}</h3>
                </div>
                
                <div className="w-full grid grid-cols-2 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800 mt-auto">
                    <div className="bg-slate-950/50 p-3 text-center">
                        <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">OVR</div>
                        <div className="text-xl font-display font-bold" style={{ color: team.primaryColor }}>{rating}</div>
                    </div>
                    <div className="bg-slate-950/50 p-3 text-center">
                        <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">CAP</div>
                        <div className="text-xl font-display font-bold text-slate-300">${(team.budget / 1000000).toFixed(0)}M</div>
                    </div>
                </div>

                <div 
                  className={`absolute inset-x-0 bottom-0 h-1 transition-all duration-500 transform ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                  style={{ backgroundColor: team.primaryColor }}
                ></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeamSelection;