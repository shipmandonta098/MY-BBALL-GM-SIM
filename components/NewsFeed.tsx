import React, { useState, useMemo } from 'react';
import { LeagueState, NewsItem, NewsCategory, Team, Player } from '../types';
import TeamBadge from './TeamBadge';

interface NewsFeedProps {
  league: LeagueState;
  onViewPlayer: (player: Player) => void;
  onViewRoster: (teamId: string) => void;
  setActiveTab: (tab: any) => void;
}

const NewsFeed: React.FC<NewsFeedProps> = ({ league, onViewPlayer, onViewRoster, setActiveTab }) => {
  const [filter, setFilter] = useState<NewsCategory | 'all' | 'user'>('all');
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  const filteredNews = useMemo(() => {
    let list = [...(league.newsFeed || [])].sort((a, b) => b.realTimestamp - a.realTimestamp);
    if (filter === 'all') return list;
    if (filter === 'user') return list.filter(n => n.teamId === league.userTeamId);
    return list.filter(n => n.category === filter);
  }, [league.newsFeed, filter, league.userTeamId]);

  const getCategoryColor = (cat: NewsCategory) => {
    switch (cat) {
      case 'rumor': return 'text-amber-500';
      case 'transaction': return 'text-emerald-500';
      case 'injury': return 'text-rose-500';
      case 'firing': return 'text-purple-500';
      case 'trade_request': return 'text-orange-500';
      case 'award': return 'text-yellow-500';
      default: return 'text-slate-500';
    }
  };

  const getCategoryIcon = (cat: NewsCategory) => {
    switch (cat) {
      case 'rumor': return '📢';
      case 'transaction': return '📝';
      case 'injury': return '🏥';
      case 'firing': return '🚫';
      case 'trade_request': return '🔥';
      case 'award': return '🏆';
      default: return '🏀';
    }
  };

  const formatRelativeTime = (time: number) => {
    const diff = Date.now() - time;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return 'Yesterday';
  };

  const handleNewsClick = (item: NewsItem) => {
    if (item.playerId) {
      const player = league.teams.flatMap(t => t.roster).find(p => p.id === item.playerId);
      if (player) onViewPlayer(player);
    } else if (item.teamId) {
      onViewRoster(item.teamId);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800 pt-6 pb-4">
        <div className="flex items-center justify-between mb-6 px-4">
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight text-white">Dynasty <span className="text-amber-500">Feed</span></h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Live Updates</span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 px-4 scrollbar-none">
          {['all', 'user', 'rumor', 'transaction', 'injury', 'firing', 'trade_request'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat as any)}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${filter === cat ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}
            >
              {cat === 'trade_request' ? 'Requests' : cat === 'user' ? 'My Franchise' : cat}
            </button>
          ))}
        </div>
      </header>

      <div className="divide-y divide-slate-800/50">
        {filteredNews.length > 0 ? (
          filteredNews.map(item => {
            const team = league.teams.find(t => t.id === item.teamId);
            return (
              <div 
                key={item.id} 
                onClick={() => handleNewsClick(item)}
                className="p-6 hover:bg-slate-900/40 transition-colors cursor-pointer group flex gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-xl shrink-0 border border-slate-700 shadow-inner group-hover:border-amber-500/50 transition-colors overflow-hidden">
                  {team
                    ? <div className="w-full h-full flex items-center justify-center font-black text-white text-[9px]" style={{ backgroundColor: team.primaryColor }}>
                        {(team.abbreviation || team.name).substring(0, 2).toUpperCase()}
                      </div>
                    : <span>{getCategoryIcon(item.category)}</span>}
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100 uppercase text-sm tracking-tight">
                        {team ? team.name : 'League Insider'}
                      </span>
                      <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M6.293 9.293a1 1 0 011.414 0L10 11.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest ml-1">
                        @{team ? team.city.replace(/\s+/g, '') + 'Hoops' : 'HDInsider'}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600">{formatRelativeTime(item.realTimestamp)}</span>
                  </div>

                  {item.isBreaking && (
                    <div className="inline-block px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[8px] font-black uppercase rounded mb-1 tracking-[0.2em]">
                      Breaking News
                    </div>
                  )}

                  <p className="text-white text-base leading-relaxed font-medium">
                    {item.content}
                  </p>

                  <div className="flex items-center gap-6 pt-2">
                    <div className="flex items-center gap-2 text-slate-600 group-hover:text-amber-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">{Math.floor(Math.random() * 200)} Comments</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 group-hover:text-rose-500 transition-colors">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                       <span className="text-[10px] font-black uppercase tracking-widest">{Math.floor(Math.random() * 1000)} Likes</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-700 m-4">
            <p className="font-display text-2xl uppercase tracking-widest">Feed is quiet...</p>
            <p className="text-[10px] font-black uppercase mt-2">Advance the season to see rumors and league updates.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsFeed;