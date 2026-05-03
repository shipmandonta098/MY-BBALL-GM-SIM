import React, { useEffect } from 'react';
import { OwnerReaction, OwnerMood } from '../utils/ownerReactionEngine';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface OwnerReactionModalProps {
  reaction: OwnerReaction;
  moveType: 'signing' | 'trade' | 'release';
  onProceed: () => void;
  onCancel: () => void;
}

const moodConfig: Record<OwnerMood, {
  emoji: string;
  avatarGrad: string;
  borderColor: string;
  accentColor: string;
  proceedLabel: string;
}> = {
  elated:    { emoji: '🤩', avatarGrad: 'from-amber-400 to-orange-500',  borderColor: 'border-amber-500/40',  accentColor: 'text-amber-400',  proceedLabel: 'Finalize' },
  happy:     { emoji: '😊', avatarGrad: 'from-emerald-500 to-teal-600',  borderColor: 'border-emerald-500/30', accentColor: 'text-emerald-400', proceedLabel: 'Finalize' },
  neutral:   { emoji: '🤔', avatarGrad: 'from-slate-500 to-slate-600',   borderColor: 'border-slate-600/40',   accentColor: 'text-slate-300',  proceedLabel: 'Finalize' },
  concerned: { emoji: '😟', avatarGrad: 'from-orange-500 to-red-600',    borderColor: 'border-orange-500/40',  accentColor: 'text-orange-400', proceedLabel: 'Proceed Anyway' },
  angry:     { emoji: '😤', avatarGrad: 'from-red-600 to-rose-700',      borderColor: 'border-red-500/50',     accentColor: 'text-red-400',    proceedLabel: 'Proceed Anyway' },
};

const moveLabelMap = { signing: 'Signing', trade: 'Trade', release: 'Release' };

const OwnerReactionModal: React.FC<OwnerReactionModalProps> = ({
  reaction,
  moveType,
  onProceed,
  onCancel,
}) => {
  const cfg = moodConfig[reaction.mood];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter')  onProceed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onProceed]);

  const DeltaIcon = reaction.ownerDelta > 0 ? TrendingUp : reaction.ownerDelta < 0 ? TrendingDown : Minus;
  const deltaColor = reaction.ownerDelta > 0 ? 'text-emerald-400' : reaction.ownerDelta < 0 ? 'text-red-400' : 'text-slate-400';
  const deltaSign  = reaction.ownerDelta > 0 ? '+' : '';

  return (
    <div
      className="fixed inset-0 z-[1300] bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className={`relative bg-slate-900 border ${cfg.borderColor} rounded-[2.5rem] w-full max-w-md shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent stripe */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${cfg.avatarGrad} rounded-t-[2.5rem]`} />

        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-5 right-5 w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors z-10"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>

        <div className="px-7 pt-7 pb-6">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-5">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              Owner Reaction
            </span>
            <span className="text-[10px] font-black text-slate-700 uppercase">·</span>
            <span className={`text-[10px] font-black uppercase tracking-widest ${cfg.accentColor}`}>
              {moveLabelMap[moveType]}
            </span>
          </div>

          {/* Owner avatar + approval delta */}
          <div className="flex items-center gap-5 mb-6">
            <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${cfg.avatarGrad} flex items-center justify-center shadow-xl flex-shrink-0`}>
              <span className="text-4xl">{cfg.emoji}</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Owner Approval</p>
              <div className={`flex items-center gap-2 ${deltaColor}`}>
                <DeltaIcon className="w-5 h-5" />
                <span className="text-3xl font-display font-black">
                  {deltaSign}{reaction.ownerDelta}
                </span>
              </div>
              {reaction.fanDelta !== 0 && (
                <p className={`text-xs font-bold mt-1 ${reaction.fanDelta > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                  Fan Approval {reaction.fanDelta > 0 ? '+' : ''}{reaction.fanDelta}
                </p>
              )}
            </div>
          </div>

          {/* Title */}
          <h2 className="text-lg font-display font-black text-white uppercase leading-tight mb-3">
            {reaction.title}
          </h2>

          {/* Quote */}
          <blockquote className={`text-sm leading-relaxed ${cfg.accentColor} italic border-l-2 border-current pl-4`}>
            {reaction.quote}
          </blockquote>

          {/* Warning for negative reactions */}
          {(reaction.mood === 'concerned' || reaction.mood === 'angry') && (
            <div className="mt-4 flex items-start gap-2 bg-red-950/40 border border-red-500/20 rounded-xl p-3">
              <span className="text-sm mt-0.5">⚠️</span>
              <p className="text-xs text-red-300 leading-relaxed">
                {reaction.mood === 'angry'
                  ? 'Low owner approval risks early-season firing if results don\'t improve.'
                  : 'Repeated disapproved moves will erode owner trust over the season.'}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-7 pb-7 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase tracking-wider rounded-2xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            className={`flex-1 py-3.5 font-black text-sm uppercase tracking-wider rounded-2xl transition-all active:scale-[0.98] shadow-lg
              ${reaction.mood === 'elated' || reaction.mood === 'happy'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20'
                : reaction.mood === 'neutral'
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white shadow-red-500/20'
              }`}
          >
            {cfg.proceedLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OwnerReactionModal;
