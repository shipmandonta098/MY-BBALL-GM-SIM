import React, { useState, useEffect } from 'react';
import { OffseasonAlert } from '../types';
import { X, ChevronRight, ChevronLeft, UserCheck, Bell, Star, Users } from 'lucide-react';

interface OffseasonAlertsModalProps {
  alerts: OffseasonAlert[];
  isWomensLeague: boolean;
  onDismiss: (alertId: string) => void;
  onDismissAll: () => void;
  onOfferContract: (alertId: string) => void;
  onClose: () => void;
}

/** Format salary smartly: WNBA scale uses $Xk, NBA scale uses $X.XM */
const fmtSalary = (salary: number, isWomens: boolean): string => {
  if (isWomens || salary < 2_000_000) {
    if (salary >= 1_000_000) return `$${(salary / 1_000_000).toFixed(2)}M`;
    return `$${Math.round(salary / 1_000)}k`;
  }
  return `$${(salary / 1_000_000).toFixed(1)}M`;
};

const ratingColor = (r: number) =>
  r >= 90 ? 'text-amber-400'
  : r >= 82 ? 'text-emerald-400'
  : r >= 74 ? 'text-sky-400'
  : 'text-slate-400';

const typeConfig = {
  summary:    { label: 'Roster Summary',  color: 'bg-slate-700 text-slate-300',   icon: Users  },
  own_fa:     { label: 'Your Free Agent', color: 'bg-amber-500/20 text-amber-300', icon: UserCheck },
  notable_fa: { label: 'Notable FA',      color: 'bg-sky-500/20  text-sky-300',    icon: Star   },
};

const InitialsAvatar: React.FC<{ name: string; rating?: number }> = ({ name, rating }) => {
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  const bg =
    (rating ?? 0) >= 90 ? 'from-amber-500 to-orange-600'
    : (rating ?? 0) >= 82 ? 'from-emerald-500 to-teal-600'
    : (rating ?? 0) >= 74 ? 'from-sky-500 to-blue-600'
    : 'from-slate-600 to-slate-700';
  return (
    <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${bg} flex items-center justify-center shadow-xl flex-shrink-0`}>
      <span className="text-2xl font-display font-black text-white uppercase tracking-wider">{initials}</span>
    </div>
  );
};

const OffseasonAlertsModal: React.FC<OffseasonAlertsModalProps> = ({
  alerts,
  isWomensLeague,
  onDismiss,
  onDismissAll,
  onOfferContract,
  onClose,
}) => {
  const pending = alerts.filter(a => !a.dismissed);
  const [idx, setIdx] = useState(0);

  // Clamp index when alerts are dismissed
  useEffect(() => {
    setIdx(i => Math.min(i, Math.max(0, pending.length - 1)));
  }, [pending.length]);

  // Esc key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (pending.length === 0) return null;

  const alert = pending[idx];
  const cfg   = typeConfig[alert.type];
  const Icon  = cfg.icon;
  const total = pending.length;
  const isOwn = alert.type === 'own_fa';

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(total - 1, i + 1));

  const handleDismiss = () => {
    onDismiss(alert.id);
    // Stay at same index (next alert slides in), but clamp if last
    if (idx >= total - 1) setIdx(Math.max(0, total - 2));
  };

  return (
    <div
      className="fixed inset-0 z-[1200] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 border border-slate-700/60 rounded-[2.5rem] w-full max-w-lg shadow-[0_0_80px_rgba(0,0,0,0.7)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Accent stripe ── */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-t-[2.5rem]" />

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-7 pt-7 pb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
              Offseason Alerts
            </span>
          </div>
          <div className="flex items-center gap-3">
            {total > 1 && (
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {idx + 1} / {total}
              </span>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="px-7 pb-2">
          {/* Type badge */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>
            <Icon className="w-3 h-3" />
            {cfg.label}
          </span>

          {/* Player / summary card */}
          <div className="mt-5 flex items-start gap-4">
            {alert.type !== 'summary' && alert.playerName && (
              <InitialsAvatar name={alert.playerName} rating={alert.playerRating} />
            )}
            {alert.type === 'summary' && (
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-xl flex-shrink-0">
                <Users className="w-9 h-9 text-slate-400" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-display font-black uppercase text-white leading-tight">
                {alert.playerName}
              </h2>
              {alert.type !== 'summary' && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {alert.playerRating && (
                    <span className={`text-sm font-black ${ratingColor(alert.playerRating)}`}>
                      {alert.playerRating} OVR
                    </span>
                  )}
                  {alert.playerPosition && (
                    <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-800 px-2 py-0.5 rounded-lg">
                      {alert.playerPosition}
                    </span>
                  )}
                  {alert.playerAge && (
                    <span className="text-[10px] text-slate-500 font-bold">Age {alert.playerAge}</span>
                  )}
                  {alert.faType && (
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${alert.faType === 'RFA' ? 'bg-orange-500/20 text-orange-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {alert.faType}
                    </span>
                  )}
                </div>
              )}

              {/* Desired contract */}
              {alert.salary && alert.contractYears && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Seeking:</span>
                  <span className="text-xs font-black text-emerald-400">
                    {fmtSalary(alert.salary, isWomensLeague)}/yr · {alert.contractYears} yr{alert.contractYears > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Message */}
          <p className="mt-5 text-sm text-slate-300 leading-relaxed">
            {alert.message}
          </p>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="px-7 py-6 space-y-3">
          {/* Primary action */}
          {alert.type !== 'summary' && (
            <button
              onClick={() => onOfferContract(alert.id)}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
            >
              {isOwn ? 'Offer Contract — Go to FA Market' : 'View in FA Market'}
            </button>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleDismiss}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase tracking-wider rounded-2xl transition-all"
            >
              Dismiss
            </button>
            {total > 1 && (
              <>
                <button
                  onClick={prev}
                  disabled={idx === 0}
                  className="w-12 flex items-center justify-center py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 rounded-2xl transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={next}
                  disabled={idx === total - 1}
                  className="w-12 flex items-center justify-center py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 rounded-2xl transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Dismiss all */}
          {total > 1 && (
            <button
              onClick={onDismissAll}
              className="w-full text-center text-[11px] font-bold text-slate-600 hover:text-slate-400 transition-colors py-1"
            >
              Dismiss all {total} alerts
            </button>
          )}
        </div>

        {/* ── Progress dots ─────────────────────────────────────────────────── */}
        {total > 1 && (
          <div className="flex justify-center gap-1.5 pb-5">
            {pending.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`rounded-full transition-all ${i === idx ? 'w-4 h-2 bg-amber-500' : 'w-2 h-2 bg-slate-700 hover:bg-slate-600'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OffseasonAlertsModal;
