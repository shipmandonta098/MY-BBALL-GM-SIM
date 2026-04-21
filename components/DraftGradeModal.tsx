import React from 'react';
import { DraftGradeData, OffseasonLetterGrade } from '../utils/offseasonGradeEngine';

interface Props {
  data: DraftGradeData;
  teamName: string;
  onDismiss: () => void;
  onViewDraft: () => void;
}

const GRADE_META: Record<OffseasonLetterGrade, { color: string; bg: string; label: string; ambientBg: string }> = {
  'A+': { color: 'text-emerald-300', bg: 'bg-emerald-500/20 border-emerald-400/60', label: 'Exceptional',   ambientBg: 'bg-emerald-500' },
  'A':  { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/50', label: 'Excellent',     ambientBg: 'bg-emerald-500' },
  'A-': { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/40', label: 'Very Strong',   ambientBg: 'bg-emerald-600' },
  'B+': { color: 'text-yellow-300',  bg: 'bg-yellow-500/15 border-yellow-400/50',   label: 'Strong',        ambientBg: 'bg-yellow-500'  },
  'B':  { color: 'text-yellow-400',  bg: 'bg-yellow-500/12 border-yellow-500/40',   label: 'Good',          ambientBg: 'bg-yellow-500'  },
  'B-': { color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-400/35',   label: 'Decent',        ambientBg: 'bg-yellow-600'  },
  'C+': { color: 'text-orange-400',  bg: 'bg-orange-500/12 border-orange-500/35',   label: 'Average',       ambientBg: 'bg-orange-500'  },
  'C':  { color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-400/30',   label: 'Below Average', ambientBg: 'bg-orange-600'  },
  'C-': { color: 'text-orange-500',  bg: 'bg-orange-600/10 border-orange-500/25',   label: 'Weak',          ambientBg: 'bg-orange-700'  },
  'D':  { color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/40',         label: 'Poor',          ambientBg: 'bg-red-600'     },
  'F':  { color: 'text-red-500',     bg: 'bg-red-900/20 border-red-700/50',         label: 'Unacceptable',  ambientBg: 'bg-red-800'     },
};

const CLASS_META: Record<DraftGradeData['classStrength'], { color: string; bg: string; icon: string }> = {
  Strong:  { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/40', icon: '★★★' },
  Average: { color: 'text-yellow-400',  bg: 'bg-yellow-500/12 border-yellow-500/35',  icon: '★★☆' },
  Weak:    { color: 'text-slate-400',   bg: 'bg-slate-700/30 border-slate-600/40',     icon: '★☆☆' },
};

function ApprovalBar({ before, after, change }: { before: number; after: number; change: number }) {
  const positive = change >= 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest">
        <span className="text-slate-400">Owner Approval</span>
        <span className={`flex items-center gap-1 ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
          <span className="text-base leading-none">{positive ? '↑' : '↓'}</span>
          {positive ? '+' : ''}{change}
          <span className="text-slate-600 mx-0.5">→</span>
          <span className="text-white">{after}</span>
          <span className="text-slate-600 font-normal">/100</span>
        </span>
      </div>
      <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-slate-600 rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, before))}%` }}
        />
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${Math.max(0, Math.min(100, after))}%` }}
        />
      </div>
    </div>
  );
}

const DraftGradeModal: React.FC<Props> = ({ data, teamName, onDismiss, onViewDraft }) => {
  const meta  = GRADE_META[data.grade];
  const classMeta = CLASS_META[data.classStrength];
  const leagueName = data.isWomensLeague ? 'WNBA' : 'NBA';

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-md my-auto animate-in zoom-in-95 fade-in duration-400">

        {/* Ambient glow */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 blur-[90px] rounded-full opacity-20 pointer-events-none ${meta.ambientBg}`}
        />

        <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-0.5">
                Season {data.season} · {leagueName} Draft
              </p>
              <h2 className="text-lg font-display font-bold uppercase text-white tracking-tight">
                Draft Grade
              </h2>
            </div>
            <button
              onClick={onDismiss}
              className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-5">

            {/* Grade row */}
            <div className="flex items-center gap-4">
              <div className={`shrink-0 w-24 h-24 rounded-2xl border-2 flex flex-col items-center justify-center shadow-xl ${meta.bg}`}>
                <span className={`text-4xl font-display font-black leading-none ${meta.color}`}>{data.grade}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${meta.color} opacity-70`}>{meta.label}</span>
              </div>
              <div className="flex-1 space-y-2">
                {/* Class strength */}
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-black ${classMeta.bg} ${classMeta.color}`}>
                  <span>{classMeta.icon}</span>
                  <span>{data.classStrength} Draft Class</span>
                </div>
                {/* Top pick */}
                {data.topPickName && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Top Pick</p>
                    <p className="text-sm font-bold text-white">
                      {data.topPickName}
                      <span className="text-slate-400 font-normal ml-1.5 text-xs">
                        {data.topPickPosition} · {data.topPickRating} OVR
                      </span>
                    </p>
                  </div>
                )}
                {data.userPicksCount === 0 && (
                  <p className="text-xs text-slate-500 italic">No picks made this draft.</p>
                )}
              </div>
            </div>

            {/* Owner quote */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Owner's Take</p>
              <p className="text-sm text-slate-300 italic leading-relaxed">{data.ownerQuote}</p>
            </div>

            {/* Approval */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
              <ApprovalBar
                before={data.ownerApprovalBefore}
                after={data.ownerApprovalAfter}
                change={data.ownerApprovalChange}
              />
            </div>

            {/* CTAs */}
            <div className="flex gap-3">
              <button
                onClick={onViewDraft}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-bold text-sm rounded-xl transition-all active:scale-95"
              >
                View Draft Board
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black uppercase text-sm rounded-xl transition-all active:scale-95"
              >
                Continue →
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default DraftGradeModal;
