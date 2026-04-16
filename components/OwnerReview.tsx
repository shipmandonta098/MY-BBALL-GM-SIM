import React from 'react';
import { OwnerReviewData } from '../types';

interface OwnerReviewProps {
  data: OwnerReviewData;
  teamName: string;
  onDismiss: () => void;
}

const GRADE_META: Record<OwnerReviewData['grade'], { color: string; glow: string; label: string }> = {
  'A+': { color: 'text-amber-400',   glow: 'shadow-amber-500/40',   label: 'Exceptional'   },
  'A':  { color: 'text-amber-300',   glow: 'shadow-amber-400/30',   label: 'Excellent'      },
  'B+': { color: 'text-emerald-400', glow: 'shadow-emerald-500/40', label: 'Very Good'      },
  'B':  { color: 'text-emerald-300', glow: 'shadow-emerald-400/30', label: 'Good'           },
  'C+': { color: 'text-sky-400',     glow: 'shadow-sky-500/30',     label: 'Average'        },
  'C':  { color: 'text-slate-300',   glow: 'shadow-slate-500/20',   label: 'Below Average'  },
  'D':  { color: 'text-orange-400',  glow: 'shadow-orange-500/30',  label: 'Poor'           },
  'F':  { color: 'text-rose-500',    glow: 'shadow-rose-500/40',    label: 'Unacceptable'   },
};

const PLAYOFF_LABEL: Record<OwnerReviewData['playoffResult'], string> = {
  champion:    '🏆 Champions',
  finals:      '🥈 Finals',
  semifinals:  '🔥 Conference Finals',
  first_round: '❌ First Round Exit',
  none:        '⛔ Missed Playoffs',
};

const PLAYOFF_COLOR: Record<OwnerReviewData['playoffResult'], string> = {
  champion:    'text-amber-400 bg-amber-500/15 border-amber-500/30',
  finals:      'text-slate-200 bg-slate-500/15 border-slate-500/30',
  semifinals:  'text-orange-400 bg-orange-500/15 border-orange-500/30',
  first_round: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  none:        'text-rose-600 bg-rose-900/20 border-rose-700/30',
};

function ApprovalBar({ label, before, after, change }: { label: string; before: number; after: number; change: number }) {
  const positive = change >= 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest">
        <span className="text-slate-400">{label}</span>
        <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>
          {positive ? '+' : ''}{change} → <span className="text-white">{after}</span>/100
        </span>
      </div>
      <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
        {/* Previous level */}
        <div
          className="absolute left-0 top-0 h-full bg-slate-600 rounded-full transition-all duration-700"
          style={{ width: `${Math.max(0, Math.min(100, before))}%` }}
        />
        {/* New level */}
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${Math.max(0, Math.min(100, after))}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600 font-bold">
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>
    </div>
  );
}

const OwnerReview: React.FC<OwnerReviewProps> = ({ data, teamName, onDismiss }) => {
  const grade = GRADE_META[data.grade];
  const winPct = data.wins + data.losses > 0
    ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl my-auto animate-in zoom-in-95 fade-in duration-500">

        {/* Ambient glow behind grade */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 blur-[120px] rounded-full opacity-30 pointer-events-none ${
          data.grade === 'A+' || data.grade === 'A' ? 'bg-amber-500' :
          data.grade === 'B+' || data.grade === 'B' ? 'bg-emerald-500' :
          data.grade === 'C+' || data.grade === 'C' ? 'bg-sky-500' :
          data.grade === 'D' ? 'bg-orange-500' : 'bg-rose-700'
        }`} />

        <div className="relative bg-slate-950 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">

          {/* Header stripe */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-8 py-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-0.5">
                Season {data.season} · End-of-Year Review
              </p>
              <h2 className="text-2xl font-display font-bold uppercase text-white tracking-tight">
                {teamName} — Owner's Report
              </h2>
            </div>
            <button
              onClick={onDismiss}
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all text-lg"
            >
              ✕
            </button>
          </div>

          <div className="p-8 space-y-7">

            {/* Grade + record row */}
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Grade badge */}
              <div className={`shrink-0 w-32 h-32 rounded-3xl bg-slate-900 border-2 border-slate-700 flex flex-col items-center justify-center shadow-2xl ${grade.glow}`}>
                <span className={`text-6xl font-display font-black leading-none ${grade.color}`}>{data.grade}</span>
                <span className={`text-[10px] font-black uppercase tracking-widest mt-1 ${grade.color} opacity-80`}>{grade.label}</span>
              </div>

              {/* Stats column */}
              <div className="flex-1 space-y-3 w-full">
                {/* Record */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest">Season Record</span>
                  <span className="font-display font-bold text-xl text-white">
                    {data.wins}–{data.losses}
                    <span className="text-slate-500 text-sm font-normal ml-2">({winPct}%)</span>
                  </span>
                </div>

                {/* Playoff result */}
                <div className={`rounded-2xl px-5 py-3 border flex items-center justify-between ${PLAYOFF_COLOR[data.playoffResult]}`}>
                  <span className="text-[11px] font-black uppercase tracking-widest opacity-70">Postseason</span>
                  <span className="font-black text-sm uppercase tracking-wide">{PLAYOFF_LABEL[data.playoffResult]}</span>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Owner's Comments</p>
              {data.comments.map((c, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 mt-1.5 shrink-0" />
                  <p className="text-sm text-slate-300">{c}</p>
                </div>
              ))}
            </div>

            {/* Approval meters */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Approval Ratings</p>
              <ApprovalBar
                label="Owner Approval"
                before={data.ownerApprovalBefore}
                after={data.ownerApprovalAfter}
                change={data.ownerApprovalChange}
              />
              <ApprovalBar
                label="Fan Approval"
                before={data.fanApprovalBefore}
                after={data.fanApprovalAfter}
                change={data.fanApprovalChange}
              />
            </div>

            {/* CTA */}
            <button
              onClick={onDismiss}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black uppercase text-base rounded-2xl transition-all active:scale-95 shadow-xl shadow-amber-500/20"
            >
              Begin Offseason →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerReview;
