import React, { useState, useMemo } from 'react';
import { GameResult, Team, LeagueState } from '../types';
import TeamBadge from './TeamBadge';
import { PlayerLink, TeamLink } from '../context/NavigationContext';

interface ResultsProps {
  history: GameResult[];
  teams: Team[];
  userTeamId: string;
  onViewBoxScore: (result: GameResult, home: Team, away: Team) => void;
  onViewFranchise: (teamId: string) => void;
}

const Results: React.FC<ResultsProps> = ({ history, teams, userTeamId, onViewBoxScore, onViewFranchise }) => {
  const [filter, setFilter] = useState<'all' | 'user'>('user');
  const [searchQuery, setSearchQuery] = useState('');

  const userTeam = teams.find(t => t.id === userTeamId);

  const filteredHistory = useMemo(() => {
    return history.filter(game => {
      const isUserGame = game.homeTeamId === userTeamId || game.awayTeamId === userTeamId;
      if (filter === 'user' && !isUserGame) return false;
      
      const home = teams.find(t => t.id === game.homeTeamId);
      const away = teams.find(t => t.id === game.awayTeamId);
      const searchMatch = home?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          away?.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      return searchMatch;
    });
  }, [history, filter, searchQuery, userTeamId, teams]);


  const GameCard: React.FC<{ game: GameResult }> = ({ game }) => {
    const home = teams.find(t => t.id === game.homeTeamId)!;
    const away = teams.find(t => t.id === game.awayTeamId)!;
    const isUserHome = game.homeTeamId === userTeamId;
    const isUserGame = game.homeTeamId === userTeamId || game.awayTeamId === userTeamId;
    const userWon = isUserGame && (
      (isUserHome && game.homeScore > game.awayScore) ||
      (!isUserHome && game.awayScore > game.homeScore)
    );

    return (
      <div
        onClick={() => onViewBoxScore(game, home, away)}
        className={`group bg-slate-900 border ${isUserGame ? (userWon ? 'border-emerald-500/30' : 'border-rose-500/30') : 'border-slate-800'} rounded-3xl p-6 hover:border-amber-500/50 transition-all cursor-pointer shadow-xl relative overflow-hidden`}
      >
        {isUserGame && (
           <div className={`absolute top-0 right-0 px-4 py-1 text-[10px] font-black uppercase tracking-widest ${userWon ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}`}>
              {userWon ? 'Win' : 'Loss'}
           </div>
        )}
        <div className="flex items-center justify-center gap-8">
           <div className="text-center">
               <TeamBadge team={home} size="md" className="mx-auto mb-2" />
              <TeamLink teamId={home.id} name={home.name} className="text-[10px] font-black text-slate-500 uppercase tracking-widest" />
           </div>
           <div className="text-center">
              <p className="text-3xl font-display font-black text-white">{game.homeScore} - {game.awayScore}</p>
              <p className="text-[10px] font-bold uppercase mt-1">
                <span className="text-slate-600">Final</span>
                {game.isOvertime && (
                  <span className="text-amber-500 ml-1">
                    {(game.quarterScores?.home?.length ?? 4) === 5 ? '· OT' :
                     (game.quarterScores?.home?.length ?? 4) === 6 ? '· 2OT' :
                     (game.quarterScores?.home?.length ?? 4) >= 7 ? '· 3OT' : '· OT'}
                  </span>
                )}
                <span className="text-slate-600 ml-1">· Day {game.date}</span>
              </p>
           </div>
           <div className="text-center">
               <TeamBadge team={away} size="md" className="mx-auto mb-2" />
              <TeamLink teamId={away.id} name={away.name} className="text-[10px] font-black text-slate-500 uppercase tracking-widest" />
           </div>
        </div>
      </div>
    );
  };

  if (!userTeam) {
    return (
      <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
        <p className="font-display text-2xl uppercase tracking-widest text-slate-700">Team Initialization Pending</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
         <div className="flex gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800">
            <button 
               onClick={() => setFilter('user')}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'user' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
               My Franchise
            </button>
            <button 
               onClick={() => setFilter('all')}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
               League Wide
            </button>
            <button 
               onClick={() => onViewFranchise(userTeamId)}
               className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-slate-800 text-amber-500 hover:bg-slate-700 border border-amber-500/20"
            >
               Franchise History
            </button>
         </div>

         <div className="relative w-full md:w-80">
            <input 
               type="text" 
               placeholder="Search by opponent..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-6 py-3.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
         </div>
      </div>

      {/* Game Log */}
      <div className="space-y-4">
         {filteredHistory.length > 0 ? (
            filteredHistory.map(game => <GameCard key={game.id} game={game} />)
         ) : (
            <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
               <p className="font-display text-2xl uppercase tracking-widest text-slate-700">Historical Records Empty</p>
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800 mt-2">Simulate games to build your dynasty history</p>
            </div>
         )}
      </div>
    </div>
  );
};

export default Results;