import React from 'react';
import { Prospect } from '../types';
import { getFlag } from '../constants';

interface ProspectProfileProps {
  prospect: Prospect;
  isUserTurn: boolean;
  onDraft?: () => void;
  onClose: () => void;
  scoutingReport?: string;
  /** User team scouting budget (20–100). Controls rating noise shown to user. */
  scoutBudget?: number;
}

const ATTR_GROUPS: Record<string, string[]> = {
  Offense: ['shooting3pt', 'shootingMid', 'freeThrow', 'layups', 'dunks', 'ballHandling', 'passing', 'offensiveIQ', 'postScoring'],
  Defense: ['perimeterDef', 'interiorDef', 'steals', 'blocks', 'defensiveIQ'],
  Physical: ['speed', 'strength', 'jumping', 'stamina', 'athleticism'],
  Rebounding: ['offReb', 'defReb'],
};

const ATTR_LABELS: Record<string, string> = {
  shooting3pt: '3PT Shooting',
  shootingMid: 'Mid Range',
  freeThrow: 'Free Throw',
  layups: 'Layups',
  dunks: 'Dunks',
  ballHandling: 'Ball Handling',
  passing: 'Passing',
  offensiveIQ: 'Off. IQ',
  postScoring: 'Post Scoring',
  perimeterDef: 'Perimeter D',
  interiorDef: 'Interior D',
  steals: 'Steals',
  blocks: 'Blocks',
  defensiveIQ: 'Def. IQ',
  speed: 'Speed',
  strength: 'Strength',
  jumping: 'Jumping',
  stamina: 'Stamina',
  athleticism: 'Athleticism',
  offReb: 'Off. Rebound',
  defReb: 'Def. Rebound',
};

const projectedRole = (rating: number) => {
  if (rating >= 85) return { label: 'Franchise Star', color: 'text-amber-400' };
  if (rating >= 78) return { label: 'All-Star Caliber', color: 'text-orange-400' };
  if (rating >= 70) return { label: 'Starter', color: 'text-emerald-400' };
  if (rating >= 60) return { label: 'Rotation Player', color: 'text-blue-400' };
  if (rating >= 50) return { label: 'Bench Player', color: 'text-slate-400' };
  return { label: 'Developmental', color: 'text-slate-600' };
};

const attrBarColor = (v: number) => {
  if (v >= 80) return 'bg-emerald-500';
  if (v >= 65) return 'bg-amber-500';
  if (v >= 50) return 'bg-orange-500';
  return 'bg-slate-600';
};

const ProspectProfile: React.FC<ProspectProfileProps> = ({
  prospect,
  isUserTurn,
  onDraft,
  onClose,
  scoutingReport,
  scoutBudget = 20,
}) => {
  const allAttrs = prospect.attributes as Record<string, number>;
  const attrEntries = Object.entries(allAttrs);
  const sortedAttrs = [...attrEntries].sort((a, b) => b[1] - a[1]);
  const strengths = sortedAttrs.slice(0, 3);
  const weaknesses = [...sortedAttrs].slice(-3).reverse();

  // Apply scouting noise: ±15 at Bare Minimum (20) → ±1 at Elite (100)
  // Noise is deterministic per prospect so it doesn't flicker on re-render
  const noiseRange = Math.max(1, Math.round(15 - ((scoutBudget - 20) / 80) * 14));
  const seed = prospect.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const noiseOffset = (seed % (noiseRange * 2 + 1)) - noiseRange;
  const displayRating = Math.min(99, Math.max(40, prospect.rating + noiseOffset));

  const role = projectedRole(displayRating);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300 scrollbar-thin scrollbar-thumb-slate-700">

        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 p-6 flex items-start justify-between gap-4 rounded-t-3xl">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">
                #{prospect.mockRank} Big Board
              </span>
              {prospect.archetype && (
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase rounded-full border border-amber-500/30">
                  {prospect.archetype}
                </span>
              )}
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-tight text-white truncate">
              {prospect.name}
            </h2>
            <p className="text-sm text-slate-400 mt-1 flex flex-wrap gap-x-2">
              <span className="text-amber-500 font-bold">{prospect.position}</span>
              <span>·</span>
              <span>{prospect.height}, {prospect.weight} lbs</span>
              <span>·</span>
              <span>{getFlag(prospect.country)} {prospect.hometown}</span>
              <span>·</span>
              <span className="italic">{prospect.school}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-950/60 rounded-2xl p-4 text-center border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Overall</p>
              <p className="text-4xl font-display font-black text-white">{displayRating}</p>
              {noiseRange > 1 && <p className="text-[8px] text-slate-600 font-bold mt-0.5">±{noiseRange} accuracy</p>}
            </div>
            <div className="bg-slate-950/60 rounded-2xl p-4 text-center border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Potential</p>
              <p className="text-4xl font-display font-black text-amber-500">{prospect.potential}</p>
            </div>
            <div className="bg-slate-950/60 rounded-2xl p-4 text-center border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Role Proj.</p>
              <p className={`text-xs font-display font-black uppercase leading-tight mt-1 ${role.color}`}>
                {role.label}
              </p>
            </div>
          </div>

          {/* ── Scout Grade ── */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest shrink-0">Scout Grade</span>
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`text-xl ${i < prospect.scoutGrade ? 'text-amber-500' : 'text-slate-800'}`}>★</span>
              ))}
            </div>
          </div>

          {/* ── Attribute Groups ── */}
          {Object.entries(ATTR_GROUPS).map(([group, keys]) => (
            <div key={group}>
              <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-3">{group}</h4>
              <div className="space-y-2.5">
                {keys.map(key => {
                  const val = allAttrs[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400 w-28 shrink-0">{ATTR_LABELS[key] ?? key}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${attrBarColor(val)}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-slate-300 w-8 text-right tabular-nums">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Strengths / Weaknesses ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-2xl p-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3">Strengths</h4>
              {strengths.map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-1.5 border-b border-emerald-900/30 last:border-0">
                  <span className="text-xs text-slate-300">{ATTR_LABELS[k] ?? k}</span>
                  <span className="text-xs font-bold text-emerald-400 tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-red-900/20 border border-red-800/30 rounded-2xl p-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-3">Weaknesses</h4>
              {weaknesses.map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-1.5 border-b border-red-900/30 last:border-0">
                  <span className="text-xs text-slate-300">{ATTR_LABELS[k] ?? k}</span>
                  <span className="text-xs font-bold text-red-400 tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Personality Traits ── */}
          {prospect.personalityTraits?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-3">Personality</h4>
              <div className="flex flex-wrap gap-2">
                {prospect.personalityTraits.map(t => (
                  <span key={t} className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Scouting Report ── */}
          {scoutingReport && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
              <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-3">Scout Report</h4>
              <p className="text-sm text-slate-300 italic leading-relaxed whitespace-pre-line">{scoutingReport}</p>
            </div>
          )}
        </div>

        {/* ── Sticky Footer ── */}
        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 p-4 flex justify-between items-center rounded-b-3xl gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-sm rounded-xl transition-all"
          >
            ← Back
          </button>
          {isUserTurn && onDraft && (
            <button
              onClick={() => { onDraft(); onClose(); }}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black uppercase text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              Draft {prospect.name} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProspectProfile;
