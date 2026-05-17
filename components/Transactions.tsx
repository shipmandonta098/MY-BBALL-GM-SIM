import React, { useState, useMemo } from 'react';
import { LeagueState, Transaction, TransactionType, Team } from '../types';
import TeamBadge from './TeamBadge';
import { useNavigation } from '../context/NavigationContext';
import { fmtSalary } from '../utils/formatters';

interface TransactionsProps {
  league: LeagueState;
}

const Transactions: React.FC<TransactionsProps> = ({ league }) => {
  const { viewTeam } = useNavigation();
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyUser, setShowOnlyUser] = useState(false);

  const filteredTransactions = useMemo(() => {
    return (league.transactions || [])
      .filter(tx => {
        const matchesType = filterType === 'all' || tx.type === filterType;
        const matchesTeam = filterTeam === 'all' || tx.teamIds.includes(filterTeam);
        const matchesUser = !showOnlyUser || tx.teamIds.includes(league.userTeamId);
        const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesType && matchesTeam && matchesUser && matchesSearch;
      });
  }, [league.transactions, filterType, filterTeam, showOnlyUser, searchTerm, league.userTeamId]);

  const stats = useMemo(() => {
    const txs = league.transactions || [];
    const trades = txs.filter(t => t.type === 'trade').length;
    const biggestMove = [...txs].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    
    const gmCounts: Record<string, number> = {};
    txs.forEach(t => {
      t.teamIds.forEach(id => {
        gmCounts[id] = (gmCounts[id] || 0) + 1;
      });
    });
    const mostActiveId = Object.keys(gmCounts).sort((a,b) => gmCounts[b] - gmCounts[a])[0];
    const mostActiveTeam = league.teams.find(t => t.id === mostActiveId);

    return {
      trades,
      biggestMove,
      mostActiveTeam,
      mostActiveCount: mostActiveId ? gmCounts[mostActiveId] : 0
    };
  }, [league.transactions, league.teams]);

  const getIcon = (type: TransactionType) => {
    switch (type) {
      case 'trade': return { emoji: '⇄', color: 'bg-emerald-500' };
      case 'signing': return { emoji: '$', color: 'bg-emerald-600' };
      case 'release': return { emoji: '✕', color: 'bg-rose-500' };
      case 'hiring': return { emoji: '💼', color: 'bg-purple-500' };
      case 'firing': return { emoji: '🚫', color: 'bg-purple-600' };
      case 'injury': return { emoji: '🩹', color: 'bg-rose-600' };
      case 'draft': return { emoji: '🎓', color: 'bg-amber-500' };
      default: return { emoji: '•', color: 'bg-slate-500' };
    }
  };

  const formatMoney = fmtSalary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">League <span className="text-amber-500">Transactions</span></h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Total Recorded Events: <span className="text-amber-500">{(league.transactions || []).length}</span>
            </p>
          </div>
          <div className="flex gap-4">
             <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Trades this Season</p>
                <p className="text-2xl font-display font-bold text-emerald-400">{stats.trades}</p>
             </div>
             <button 
               onClick={() => setShowOnlyUser(!showOnlyUser)}
               className={`px-6 py-3 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest ${showOnlyUser ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
             >
                {showOnlyUser ? 'Showing Your Team' : 'All League Moves'}
             </button>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex items-center gap-6">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center text-3xl">💰</div>
            <div>
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Biggest Move Value</p>
               {stats.biggestMove ? (
                  <>
                    <p className="text-xl font-display font-bold text-white uppercase">{formatMoney(stats.biggestMove.value || 0)}</p>
                    <p className="text-[10px] text-slate-600 font-bold uppercase truncate max-w-[200px]">{stats.biggestMove.description}</p>
                  </>
               ) : <p className="text-xl font-display font-bold text-slate-700 uppercase">None</p>}
            </div>
         </div>
         <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex items-center gap-6">
            <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-3xl">📊</div>
            <div>
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Most Active GM</p>
               {stats.mostActiveTeam ? (
                  <>
                    <p className="text-xl font-display font-bold text-white uppercase">{stats.mostActiveTeam.name}</p>
                    <p className="text-[10px] text-slate-600 font-bold uppercase">{stats.mostActiveCount} Total Moves</p>
                  </>
               ) : <p className="text-xl font-display font-bold text-slate-700 uppercase">None</p>}
            </div>
         </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input 
          type="text" 
          placeholder="Search logs..."
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white focus:outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select 
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
        >
          <option value="all">All Types</option>
          <option value="trade">Trades</option>
          <option value="signing">Signings</option>
          <option value="release">Releases</option>
          <option value="firing">Firings</option>
          <option value="injury">Injuries</option>
          <option value="draft">Draft</option>
        </select>
        <select 
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold"
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
        >
          <option value="all">All Teams</option>
          {league.teams.sort((a,b) => a.name.localeCompare(b.name)).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center justify-center">
           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Day {league.currentDay} of Season</span>
        </div>
      </div>

      {/* Activity Log */}
      <div className="space-y-4">
        {filteredTransactions.map(tx => {
          const icon = getIcon(tx.type);
          const teams = tx.teamIds.map(id => league.teams.find(t => t.id === id)).filter(Boolean) as Team[];
          
          return (
            <div key={tx.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row gap-6 items-center shadow-xl hover:border-slate-600 transition-all">
               <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg ${icon.color}`}>
                    {icon.emoji}
                  </div>
                  <div className="md:hidden flex -space-x-4">
                    {teams.map(t => (
                       <button key={t.id} type="button" onClick={e => { e.stopPropagation(); viewTeam(t.id); }} className="focus:outline-none hover:scale-110 transition-transform">
                         <TeamBadge team={t} size="sm" className="border-4 border-slate-900 rounded-full bg-slate-800" />
                       </button>
                    ))}
                  </div>
               </div>
               
               <div className="flex-1 space-y-1 text-center md:text-left">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Day {tx.timestamp} • {new Date(tx.realTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest hidden md:inline px-2 py-0.5 rounded ${icon.color} text-white`}>{tx.type}</span>
                  </div>
                  <p className="text-base text-slate-200 font-medium leading-relaxed">
                    {tx.description}
                  </p>
               </div>

               <div className="hidden md:flex items-center -space-x-4">
                  {teams.map(t => (
                    <button key={t.id} type="button" onClick={e => { e.stopPropagation(); viewTeam(t.id); }} className="relative group focus:outline-none">
                        <TeamBadge team={t} size="md" className="border-4 border-slate-900 rounded-full bg-slate-800 shadow-xl group-hover:scale-110 transition-transform" />
                       <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-[8px] font-black uppercase text-white px-2 py-0.5 rounded-full whitespace-nowrap shadow-2xl">
                         {t.name}
                       </div>
                    </button>
                  ))}
               </div>
            </div>
          );
        })}

        {filteredTransactions.length === 0 && (
           <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-700">
              <p className="font-display text-2xl uppercase tracking-widest">Log is clear.</p>
              <p className="text-[10px] font-black uppercase mt-2">Advance the season to record league activity.</p>
           </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;