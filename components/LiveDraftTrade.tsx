import React, { useState, useMemo } from 'react';
import { LeagueState, DraftPick, Player, Team } from '../types';
import TeamBadge from './TeamBadge';

interface LiveDraftTradeProps {
  league: LeagueState;
  /** The AI-owned pick the user wants to acquire */
  targetPick: DraftPick;
  updateLeague: (u: Partial<LeagueState>) => void;
  onClose: () => void;
}

// NBA-calibrated pick value chart (pick# 1-based, overall across all rounds)
const PICK_VAL_CHART: number[] = [
  3200, 2900, 2650, 2400, 2200, 2000, 1800, 1640, 1480, 1330,
  1190, 1060,  940,  830,  730,  640,  560,  490,  430,  380,
   335,  296,  263,  235,  211,  190,  172,  156,  142,  130,
   // R2 (picks 31-60)
   112,  97,   84,   73,   63,   55,   48,   42,   37,   33,
    29,   26,   23,   21,   19,   17,   15,   14,   13,   12,
    11,   10,    9,    8,    7,    6,    6,    5,    5,    4,
];

function getPickVal(p: DraftPick): number {
  return PICK_VAL_CHART[p.pick - 1] ?? 4;
}

function getPlayerVal(p: Player): number {
  // rating-heavy + age curve
  return Math.round(p.rating * 20 + Math.max(0, 30 - p.age) * 45);
}

function pickLabel(p: DraftPick): string {
  const pos = p.round === 1 ? p.pick : p.pick - 30;
  return `R${p.round} Pick #${pos}`;
}

type OfferPiece =
  | { type: 'pick'; pick: DraftPick }
  | { type: 'player'; player: Player }
  | { type: 'cash'; amount: number };

type Status = 'building' | 'pending' | 'accepted' | 'declined';

const LiveDraftTrade: React.FC<LiveDraftTradeProps> = ({
  league,
  targetPick,
  updateLeague,
  onClose,
}) => {
  const [offerPieces, setOfferPieces] = useState<OfferPiece[]>([]);
  const [status, setStatus] = useState<Status>('building');
  const [cashAmount, setCashAmount] = useState(0);
  const [tab, setTab] = useState<'picks' | 'players' | 'cash'>('picks');
  const [confirmMsg, setConfirmMsg] = useState('');

  const currentIdx = league.currentDraftPickIndex ?? 0;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const targetTeam = league.teams.find(t => t.id === targetPick.currentTeamId)!;
  const targetVal = getPickVal(targetPick);
  const pickPos = targetPick.round === 1 ? targetPick.pick : targetPick.pick - 30;

  // User's remaining picks not already in offer
  const userPicks = useMemo(() =>
    (league.draftPicks ?? []).filter(p =>
      p.currentTeamId === league.userTeamId &&
      p.pick > currentIdx &&
      !offerPieces.some(op => op.type === 'pick' && op.pick.pick === p.pick && op.pick.round === p.round)
    ), [league.draftPicks, league.userTeamId, currentIdx, offerPieces]);

  const addPick = (p: DraftPick) =>
    setOfferPieces(prev => [...prev, { type: 'pick', pick: p }]);

  const addPlayer = (pl: Player) =>
    setOfferPieces(prev => [...prev, { type: 'player', player: pl }]);

  const addCash = () => {
    if (cashAmount <= 0) return;
    setOfferPieces(prev => [...prev, { type: 'cash', amount: cashAmount * 1_000_000 }]);
    setCashAmount(0);
  };

  const removePiece = (i: number) =>
    setOfferPieces(prev => prev.filter((_, idx) => idx !== i));

  const offerVal = useMemo(() =>
    offerPieces.reduce((s, op) => {
      if (op.type === 'pick') return s + getPickVal(op.pick);
      if (op.type === 'player') return s + getPlayerVal(op.player);
      return s + op.amount / 55_000;
    }, 0), [offerPieces]);

  const ratio = offerVal > 0 ? offerVal / targetVal : 0;

  const fairness = useMemo(() => {
    if (ratio >= 0.88 && ratio <= 1.25) return { label: 'Fair Value', color: 'text-emerald-400' };
    if (ratio > 1.25) return { label: 'Favorable for You', color: 'text-blue-400' };
    if (ratio >= 0.65) return { label: 'Below Fair Value', color: 'text-amber-400' };
    return { label: 'Low-Ball Offer', color: 'text-rose-400' };
  }, [ratio]);

  const handlePropose = () => {
    if (offerPieces.length === 0) return;
    setStatus('pending');

    setTimeout(() => {
      const personality = targetTeam.aiGM?.personality ?? 'Balanced';
      const winPct = targetTeam.wins / Math.max(1, targetTeam.wins + targetTeam.losses);
      const isEarlyPick = targetPick.pick <= Math.ceil(league.teams.length / 2);

      // Base acceptance driven by offer value ratio
      let chance = Math.max(0.04, Math.min(0.94, (ratio - 0.78) * 2.2 + 0.38));

      if (personality === 'Rebuilder') chance += 0.18;        // loves to acquire assets
      if (personality === 'Win Now') {
        if (isEarlyPick) chance -= 0.28;                       // guards top picks fiercely
        else chance += 0.10;                                   // happy to move late picks
      }
      if (personality === 'Analytics') {
        chance = ratio >= 0.93 ? 0.80 : ratio >= 0.82 ? 0.44 : 0.09;
      }
      if (personality === 'Superstar Chaser') chance -= 0.22; // extremely picky
      if (personality === 'Loyalist') chance -= 0.06;
      if (winPct >= 0.60 && isEarlyPick) chance -= 0.14;     // contenders protect picks

      const accepted = Math.random() < Math.min(0.92, Math.max(0.04, chance));

      if (accepted) {
        const offeredPickIds = offerPieces
          .filter(op => op.type === 'pick')
          .map(op => ({ round: op.pick.round, pick: op.pick.pick }));
        const offeredPlayerIds = new Set(
          offerPieces.filter(op => op.type === 'player').map(op => op.player.id)
        );

        const updatedPicks = (league.draftPicks ?? []).map(dp => {
          if (dp.pick === targetPick.pick && dp.round === targetPick.round)
            return { ...dp, currentTeamId: league.userTeamId };
          if (offeredPickIds.some(id => id.round === dp.round && id.pick === dp.pick))
            return { ...dp, currentTeamId: targetTeam.id };
          return dp;
        });

        const updatedTeams = league.teams.map(t => {
          if (t.id === league.userTeamId)
            return { ...t, roster: t.roster.filter(p => !offeredPlayerIds.has(p.id)) };
          if (t.id === targetTeam.id) {
            const incoming = userTeam.roster.filter(p => offeredPlayerIds.has(p.id));
            return { ...t, roster: [...t.roster, ...incoming] };
          }
          return t;
        });

        const playerDesc = offeredPlayerIds.size > 0 ? ` + ${offeredPlayerIds.size} player(s)` : '';
        const pickDesc = offeredPickIds.length > 0 ? offeredPickIds.map(id => {
          const dp = (league.draftPicks ?? []).find(p => p.round === id.round && p.pick === id.pick);
          return dp ? pickLabel(dp) : `R${id.round}`;
        }).join(', ') : '';

        const newsItem = {
          id: `live-draft-trade-${Date.now()}`,
          category: 'transaction' as const,
          headline: '🔀 LIVE DRAFT TRADE',
          content: `${userTeam.name} acquires ${pickLabel(targetPick)} from ${targetTeam.name}${pickDesc ? ` for ${pickDesc}` : ''}${playerDesc}.`,
          timestamp: league.currentDay,
          realTimestamp: Date.now(),
          isBreaking: true,
        };

        updateLeague({ draftPicks: updatedPicks, teams: updatedTeams, newsFeed: [newsItem, ...(league.newsFeed ?? [])] });
        setConfirmMsg(`Trade completed — ${userTeam.name} now owns Pick #${pickPos} (${pickLabel(targetPick)})`);
        setStatus('accepted');
      } else {
        setStatus('declined');
      }
    }, 1300);
  };

  // ── Pending spinner ────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-12 text-center shadow-2xl max-w-sm w-full">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white font-display font-bold uppercase text-lg tracking-wide">Awaiting Response…</p>
          <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">{targetTeam.name} Front Office</p>
        </div>
      </div>
    );
  }

  // ── Accepted ───────────────────────────────────────────────────────────────
  if (status === 'accepted') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-10 text-center shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-300">
          <div className="text-7xl mb-5">🤝</div>
          <h3 className="text-2xl font-display font-black uppercase text-emerald-400 mb-3">Trade Accepted!</h3>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-6 py-4 mb-6">
            <p className="text-white font-bold text-sm leading-relaxed">{confirmMsg}</p>
          </div>
          <p className="text-slate-500 text-xs mb-8 font-bold uppercase tracking-wider">Draft board has been updated</p>
          <button
            onClick={onClose}
            className="px-10 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black uppercase rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            Back to Draft
          </button>
        </div>
      </div>
    );
  }

  // ── Declined ───────────────────────────────────────────────────────────────
  if (status === 'declined') {
    const isEarlyPick = targetPick.pick <= Math.ceil(league.teams.length / 2);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-red-500/40 rounded-3xl p-10 text-center shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-300">
          <div className="text-7xl mb-5">❌</div>
          <h3 className="text-2xl font-display font-black uppercase text-red-400 mb-3">Trade Declined</h3>
          <p className="text-slate-400 text-sm mb-2 leading-relaxed">
            {targetTeam.name} turned down your offer.
          </p>
          <p className="text-slate-600 text-xs mb-8">
            {ratio < 0.78
              ? 'Your offer was significantly below fair value — try adding more.'
              : isEarlyPick
              ? `${targetTeam.name} is reluctant to part with a top pick.`
              : 'They may prefer a different type of return.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setStatus('building')}
              className="px-7 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black uppercase rounded-xl transition-all active:scale-95"
            >
              Revise Offer
            </button>
            <button
              onClick={onClose}
              className="px-7 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main builder ───────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300 scrollbar-thin scrollbar-thumb-slate-700">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 sticky top-0 bg-slate-900 z-10">
          <div>
            <h2 className="text-xl font-display font-black uppercase text-white tracking-tight">Live Draft Trade</h2>
            <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5 tracking-widest">Draft paused · Build your offer</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Target pick */}
          <div className="bg-slate-950/70 border border-amber-500/30 rounded-2xl p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80 mb-3">You Want to Acquire</p>
            <div className="flex items-center gap-4">
              <TeamBadge team={targetTeam} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-white text-xl uppercase leading-tight">{pickLabel(targetPick)}</p>
                <p className="text-slate-500 text-xs font-bold uppercase mt-0.5">{targetTeam.city} {targetTeam.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-black uppercase ${
                  targetPick.pick <= 5 ? 'text-amber-400' :
                  targetPick.pick <= 14 ? 'text-emerald-400' :
                  targetPick.pick <= 30 ? 'text-blue-400' : 'text-slate-400'
                }`}>
                  {targetPick.pick <= 5 ? '⭐ Top 5 Pick' :
                   targetPick.pick <= 14 ? 'Lottery Pick' :
                   targetPick.pick <= 30 ? 'First Round' : 'Second Round'}
                </p>
                <p className="text-[9px] text-slate-600 uppercase font-bold mt-0.5">Val: {targetVal}</p>
              </div>
            </div>
          </div>

          {/* Offer builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Offer</h4>
              <div className="flex gap-1 bg-slate-950/50 rounded-xl p-1">
                {(['picks', 'players', 'cash'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setTab(s)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                      tab === s ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Offer pills */}
            {offerPieces.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                {offerPieces.map((op, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] font-bold text-blue-300 leading-none">
                      {op.type === 'pick' ? pickLabel(op.pick) :
                       op.type === 'player' ? (op as any).player.name :
                       `$${((op as any).amount / 1_000_000).toFixed(0)}M Cash`}
                    </span>
                    <button onClick={() => removePiece(i)} className="text-blue-600 hover:text-rose-400 text-[10px] leading-none transition-colors">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Picks tab */}
            {tab === 'picks' && (
              <div>
                {userPicks.length === 0 ? (
                  <p className="text-slate-600 text-sm italic py-4 text-center">No remaining picks available to offer.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {userPicks.map(p => (
                      <button
                        key={`u-${p.round}-${p.pick}`}
                        onClick={() => addPick(p)}
                        className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 text-left hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group"
                      >
                        <p className="text-[10px] font-black uppercase text-slate-300 group-hover:text-amber-400">{pickLabel(p)}</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">Value: {getPickVal(p)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Players tab */}
            {tab === 'players' && (
              <div className="space-y-1 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 pr-1">
                {userTeam.roster
                  .filter(pl => !offerPieces.some(op => op.type === 'player' && (op as any).player.id === pl.id))
                  .sort((a, b) => b.rating - a.rating)
                  .map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => addPlayer(pl)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-200 group-hover:text-white uppercase tracking-tight leading-tight">{pl.name}</p>
                        <p className="text-[9px] text-slate-600 uppercase font-bold">{pl.position} · Age {pl.age} · {pl.contractYears}Y left</p>
                      </div>
                      <span className="text-lg font-display font-bold text-amber-500 tabular-nums ml-3">{pl.rating}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Cash tab */}
            {tab === 'cash' && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">
                  <span className="text-slate-500 font-bold text-sm">$</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={cashAmount || ''}
                    onChange={e => setCashAmount(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                    placeholder="0"
                    className="flex-1 bg-transparent text-white text-sm font-bold focus:outline-none"
                  />
                  <span className="text-slate-500 text-xs font-bold">million</span>
                </div>
                <button
                  onClick={addCash}
                  disabled={cashAmount <= 0}
                  className="px-5 py-3 bg-amber-500 disabled:opacity-30 text-slate-950 font-black uppercase text-xs rounded-xl transition-all hover:bg-amber-400 active:scale-95 whitespace-nowrap"
                >
                  Add Cash
                </button>
              </div>
            )}
          </div>

          {/* Value summary */}
          {offerPieces.length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-center flex-1">
                  <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">You Offer</p>
                  <p className="text-2xl font-display font-bold text-white tabular-nums">{Math.round(offerVal)}</p>
                  <p className="text-[9px] text-slate-600 mt-0.5 uppercase">{offerPieces.length} piece{offerPieces.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-center">
                  <span className="text-2xl">⇄</span>
                  <p className={`text-[9px] font-black uppercase mt-0.5 ${fairness.color}`}>{fairness.label}</p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">You Receive</p>
                  <p className="text-2xl font-display font-bold text-amber-500 tabular-nums">{targetVal}</p>
                  <p className="text-[9px] text-slate-600 mt-0.5 uppercase">{pickLabel(targetPick)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex gap-3 sticky bottom-0 bg-slate-900">
          <button
            onClick={onClose}
            className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-sm rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handlePropose}
            disabled={offerPieces.length === 0}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-black uppercase text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-500/20"
          >
            {offerPieces.length === 0 ? 'Add Offer Pieces Above' : `Propose Trade to ${targetTeam.name}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveDraftTrade;
