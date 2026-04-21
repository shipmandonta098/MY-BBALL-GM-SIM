import React from 'react';
import { OffseasonGradeData, OffseasonLetterGrade, CategoryScore } from '../utils/offseasonGradeEngine';

interface Props {
  data: OffseasonGradeData;
  teamName: string;
  onBeginPreseason: () => void;
  onViewTransactions: () => void;
  onDismiss: () => void;
}

const GRADE_META: Record<OffseasonLetterGrade, { color: string; glow: string; label: string; bg: string; ambientBg: string }> = {
  'A+': { color: 'text-emerald-300', glow: 'shadow-emerald-500/60', label: 'Exceptional',   bg: 'bg-emerald-500/20 border-emerald-400/60',  ambientBg: 'bg-emerald-500'  },
  'A':  { color: 'text-emerald-400', glow: 'shadow-emerald-500/50', label: 'Excellent',     bg: 'bg-emerald-500/15 border-emerald-500/50',  ambientBg: 'bg-emerald-500'  },
  'A-': { color: 'text-emerald-400', glow: 'shadow-emerald-500/40', label: 'Very Strong',   bg: 'bg-emerald-500/15 border-emerald-500/40',  ambientBg: 'bg-emerald-600'  },
  'B+': { color: 'text-yellow-300',  glow: 'shadow-yellow-400/40',  label: 'Strong',        bg: 'bg-yellow-500/15 border-yellow-400/50',    ambientBg: 'bg-yellow-500'   },
  'B':  { color: 'text-yellow-400',  glow: 'shadow-yellow-500/30',  label: 'Good',          bg: 'bg-yellow-500/12 border-yellow-500/40',    ambientBg: 'bg-yellow-500'   },
  'B-': { color: 'text-yellow-400',  glow: 'shadow-yellow-500/25',  label: 'Decent',        bg: 'bg-yellow-500/10 border-yellow-400/35',    ambientBg: 'bg-yellow-600'   },
  'C+': { color: 'text-orange-400',  glow: 'shadow-orange-500/30',  label: 'Average',       bg: 'bg-orange-500/12 border-orange-500/35',    ambientBg: 'bg-orange-500'   },
  'C':  { color: 'text-orange-400',  glow: 'shadow-orange-400/25',  label: 'Below Average', bg: 'bg-orange-500/10 border-orange-400/30',    ambientBg: 'bg-orange-600'   },
  'C-': { color: 'text-orange-500',  glow: 'shadow-orange-500/25',  label: 'Weak',          bg: 'bg-orange-600/10 border-orange-500/30',    ambientBg: 'bg-orange-700'   },
  'D':  { color: 'text-red-400',     glow: 'shadow-red-500/30',     label: 'Poor',          bg: 'bg-red-500/15 border-red-500/40',          ambientBg: 'bg-red-600'      },
  'F':  { color: 'text-red-500',     glow: 'shadow-red-700/40',     label: 'Unacceptable',  bg: 'bg-red-900/20 border-red-700/50',          ambientBg: 'bg-red-800'      },
};

const CAT_GRADE_COLOR: Record<OffseasonLetterGrade, string> = {
  'A+': 'text-emerald-300 bg-emerald-500/20 border-emerald-400/50',
  'A':  'text-emerald-400 bg-emerald-500/15 border-emerald-500/40',
  'A-': 'text-emerald-400 bg-emerald-500/15 border-emerald-500/35',
  'B+': 'text-yellow-300 bg-yellow-500/15 border-yellow-400/45',
  'B':  'text-yellow-400 bg-yellow-500/12 border-yellow-500/35',
  'B-': 'text-yellow-400 bg-yellow-500/10 border-yellow-400/30',
  'C+': 'text-orange-400 bg-orange-500/12 border-orange-500/30',
  'C':  'text-orange-400 bg-orange-500/10 border-orange-400/25',
  'C-': 'text-orange-500 bg-orange-600/10 border-orange-500/25',
  'D':  'text-red-400 bg-red-500/12 border-red-500/35',
  'F':  'text-red-500 bg-red-900/15 border-red-700/40',
};

function CategoryRow({ cat }: { cat: CategoryScore }) {
  const isPositive = ['A+', 'A', 'A-', 'B+', 'B', 'B-'].includes(cat.grade);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-800 last:border-0">
      <div className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center text-sm font-black ${CAT_GRADE_COLOR[cat.grade]}`}>
        {cat.grade}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-0.5">{cat.label}</p>
        <p className="text-sm text-slate-300 leading-snug">{cat.comment}</p>
      </div>
    </div>
  );
}

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
          className="absolute left-0 top-0 h-full bg-slate-600 rounded-full transition-all duration-700"
          style={{ width: `${Math.max(0, Math.min(100, before))}%` }}
        />
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${Math.max(0, Math.min(100, after))}%` }}
        />
      </div>
    </div>
  );
}

const OffseasonGradeModal: React.FC<Props> = ({
  data, teamName, onBeginPreseason, onViewTransactions, onDismiss,
}) => {
  const meta = GRADE_META[data.grade];
  const leagueName = data.isWomensLeague ? 'WNBA' : 'NBA';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl my-auto animate-in zoom-in-95 fade-in duration-500">

        {/* Ambient glow */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 blur-[100px] rounded-full opacity-25 pointer-events-none ${meta.ambientBg}`}
        />

        <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-7 py-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-0.5">
                Season {data.season} · {leagueName} Offseason
              </p>
              <h2 className="text-xl font-display font-bold uppercase text-white tracking-tight">
                Offseason Grade
              </h2>
            </div>
            <button
              onClick={onDismiss}
              className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              ✕
            </button>
          </div>

          <div className="p-7 space-y-6">

            {/* Grade + team name */}
            <div className="flex items-center gap-5">
              <div className={`shrink-0 w-28 h-28 rounded-2xl border-2 flex flex-col items-center justify-center shadow-2xl ${meta.bg} ${meta.glow}`}>
                <span className={`text-5xl font-display font-black leading-none ${meta.color}`}>{data.grade}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${meta.color} opacity-75`}>{meta.label}</span>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{teamName}</p>
                <p className="text-slate-200 text-sm leading-relaxed italic">
                  {data.ownerQuote}
                </p>
              </div>
            </div>

            {/* Category breakdown */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl px-5 py-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 pt-4 pb-2">Grade Breakdown</p>
              {data.categories.map(cat => (
                <CategoryRow key={cat.label} cat={cat} />
              ))}
            </div>

            {/* Approval meter */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <ApprovalBar
                before={data.ownerApprovalBefore}
                after={data.ownerApprovalAfter}
                change={data.ownerApprovalChange}
              />
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onViewTransactions}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-bold text-sm rounded-xl transition-all active:scale-95"
              >
                View Offseason Summary
              </button>
              <button
                onClick={onBeginPreseason}
                className={`flex-1 py-3 font-display font-black uppercase text-sm rounded-xl transition-all active:scale-95 shadow-xl ${
                  ['A+', 'A', 'A-', 'B+', 'B'].includes(data.grade)
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                }`}
              >
                Begin Preseason →
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default OffseasonGradeModal;
