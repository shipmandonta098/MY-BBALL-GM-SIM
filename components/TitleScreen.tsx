
import React, { useState, useRef } from 'react';
import { LeagueState } from '../types';
import TeamBadge from './TeamBadge';

interface TitleScreenProps {
  onNewLeague: () => void;
  onLoadSave: (league: LeagueState) => void;
  onDeleteSave: (id: string) => void;
  onRenameSave: (id: string, newName: string) => void;
  onImportSave: (league: LeagueState) => void;
  saves: LeagueState[];
}

const TitleScreen: React.FC<TitleScreenProps> = ({ 
  onNewLeague, 
  onLoadSave, 
  onDeleteSave, 
  onRenameSave, 
  onImportSave,
  saves 
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [showSaveList, setShowSaveList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStart = (callback: () => void) => {
    setIsExiting(true);
    setTimeout(callback, 800);
  };

  const handleExport = (save: LeagueState) => {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${save.leagueName.replace(/\s+/g, '_')}_save.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.leagueName && json.teams) {
          onImportSave(json);
          alert('League imported successfully!');
        } else {
          alert('Invalid save file format.');
        }
      } catch (err) {
        alert('Failed to parse save file.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleRename = (id: string, currentName: string) => {
    const newName = prompt('Enter new name for this league:', currentName);
    if (newName && newName.trim()) {
      onRenameSave(id, newName.trim());
    }
  };

  const hasSaves = saves && saves.length > 0;

  return (
    <div className={`fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[100] overflow-hidden transition-all duration-1000 ${isExiting ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100 scale-100'}`}>
      {/* Cinematic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[140px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/3 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[180px]"></div>
        
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ 
          backgroundImage: `linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)`, 
          backgroundSize: '60px 60px' 
        }}></div>
      </div>

      <div className="relative z-10 text-center px-6 max-w-5xl">
        <div className="mb-4 inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 border border-amber-500/30 text-amber-500 text-[10px] font-bold tracking-[0.4em] uppercase rounded-full shadow-lg shadow-amber-500/10 animate-fade-in">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Next-Gen Basketball Management
        </div>
        
        <h1 className="text-8xl md:text-[10rem] font-display font-bold uppercase tracking-tighter text-white leading-[0.85] mb-6 drop-shadow-2xl">
          HOOPS<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-600 to-amber-400 animate-gradient-x">DYNASTY</span>
        </h1>
        
        <p className="text-slate-400 text-lg md:text-2xl font-medium mb-16 max-w-2xl mx-auto leading-relaxed opacity-80">
          Build a legendary franchise. Scout superstars with Gemini AI. 
          The court is your canvas, the win is your masterpiece.
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-8">
          <button 
            onClick={() => handleStart(onNewLeague)}
            className="group relative w-full md:w-auto px-16 py-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-3xl uppercase tracking-wider rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(245,158,11,0.4)] overflow-hidden"
          >
            <span className="relative z-10">New Career</span>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 border-2 border-white/30 rounded-2xl scale-110 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300"></div>
          </button>

          <button 
            onClick={() => setShowSaveList(true)}
            className="group relative w-full md:w-auto px-16 py-6 bg-slate-900/80 backdrop-blur-md hover:bg-slate-800 text-slate-100 font-display font-bold text-3xl uppercase tracking-wider rounded-2xl transition-all hover:scale-105 active:scale-95 border-2 border-slate-800 hover:border-amber-500/50"
          >
            Continue
            <p className="absolute -bottom-6 left-0 right-0 text-[10px] text-slate-500 font-sans tracking-widest font-bold opacity-0 group-hover:opacity-100 transition-opacity">LOAD OR MANAGE SAVES</p>
          </button>
        </div>

        <div className="mt-32 grid grid-cols-2 md:grid-cols-4 gap-12 border-t border-slate-900/50 pt-12">
          <div className="text-center group">
            <div className="text-amber-500 font-display text-3xl group-hover:scale-110 transition-transform">FLASH 3</div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-[0.2em] mt-1">AI Logic Engine</div>
          </div>
          <div className="text-center group">
            <div className="text-amber-500 font-display text-3xl group-hover:scale-110 transition-transform">REAL-SIM</div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-[0.2em] mt-1">Court Simulation</div>
          </div>
          <div className="text-center group">
            <div className="text-amber-500 font-display text-3xl group-hover:scale-110 transition-transform">DYNAMIC</div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-[0.2em] mt-1">Market Logic</div>
          </div>
          <div className="text-center group">
            <div className="text-amber-500 font-display text-3xl group-hover:scale-110 transition-transform">CLOUD</div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-[0.2em] mt-1">Persistence</div>
          </div>
        </div>
      </div>

      {/* Save Selection Modal */}
      {showSaveList && (
        <div className="fixed inset-0 z-[120] bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-300 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-5xl font-display font-bold uppercase tracking-tight text-white">Select Save File</h2>
                <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-widest">Manage your franchises and backups</p>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".json" 
                  className="hidden" 
                />
                <button 
                  onClick={handleImportClick}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-amber-500/20 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import Save
                </button>
                <button 
                  onClick={() => setShowSaveList(false)}
                  className="p-3 bg-slate-900 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 pb-10">
              {saves.length === 0 ? (
                <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                  <p className="text-slate-500 font-display text-2xl uppercase tracking-widest mb-4">No Saves Found</p>
                  <button onClick={onNewLeague} className="text-amber-500 font-bold uppercase text-xs tracking-[0.3em] hover:text-amber-400 transition-colors">Start New Career →</button>
                </div>
              ) : (
                [...saves].sort((a,b) => b.lastUpdated - a.lastUpdated).map((s) => {
                  const userTeam = s.teams.find(t => t.id === s.userTeamId);
                  return (
                    <div key={s.id} className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between hover:border-amber-500/30 transition-all gap-6">
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-slate-800 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-700 shadow-inner group-hover:scale-105 transition-transform">
                          {userTeam ? (
                            <TeamBadge team={userTeam} size="lg" />
                          ) : (
                            <span className="font-display text-2xl text-slate-600">?</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-3xl font-display font-bold text-white uppercase group-hover:text-amber-500 transition-colors">
                              {s.leagueName}
                            </h3>
                            <button 
                              onClick={() => handleRename(s.id, s.leagueName)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 bg-slate-800 text-slate-500 hover:text-amber-500 rounded-lg transition-all"
                              title="Rename League"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          </div>
                          <p className="text-slate-400 text-sm font-medium mt-1">
                            {userTeam ? `${userTeam.city} ${userTeam.name}` : 'Team Setup Incomplete'} • {s.season} Season • Day {s.currentDay}
                          </p>
                          <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest mt-1">
                            Last played: {new Date(s.lastUpdated).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handleStart(() => onLoadSave(s))}
                          className="flex-1 md:flex-none px-10 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-lg shadow-amber-500/10 active:scale-95"
                        >
                          Tip Off
                        </button>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleExport(s)}
                            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded-xl transition-all border border-slate-700"
                            title="Export to JSON"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </button>
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!s.id) return;
                              if (window.confirm(`Permanently delete "${s.leagueName}"?`)) {
                                onDeleteSave(s.id);
                              }
                            }}
                            className="p-3 bg-slate-800 hover:bg-rose-500/20 text-slate-500 hover:text-rose-500 rounded-xl transition-all border border-slate-700"
                            title="Delete Save"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Aesthetic Footer */}
      <div className="absolute bottom-8 flex items-center gap-12 opacity-20 hover:opacity-100 transition-opacity duration-700">
        <div className="text-[10px] text-slate-500 uppercase tracking-[0.6em] font-black">© 2025 HD PRODUCTIONS</div>
        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
        <div className="text-[10px] text-slate-500 uppercase tracking-[0.6em] font-black italic">PRO GM SERIES v1.2</div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 15s ease infinite;
        }
        .animate-fade-in {
          animation: fadeIn 1s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
};

export default TitleScreen;
