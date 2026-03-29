import React, { useMemo } from 'react';
import { LeagueState, TradeProposal, TradePiece, Player, DraftPick } from '../types';
import { playerTradeValue } from '../utils/aiGMEngine';

interface TradeProposalsProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onAccept: (proposal: TradeProposal) => void;
  onCounter: (proposal: TradeProposal) => void;
}

const TradeProposals: React.FC<TradeProposalsProps> = ({
  league,
  updateLeague,
  onAccept,
  onCounter,
}) => {
  const pending  = useMemo(() => (league.incomingTradeProposals ?? []).filter(p => p.status === 'incoming'), [league.incomingTradeProposals]);
  const history  = useMemo(() => (league.incomingTradeProposals ?? []).filter(p => p.status === 'rejected').slice(0, 10), [league.incomingTradeProposals]);

  const fmtSalary = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

  const formatPiece = (piece: TradePiece) => {
    if (piece.type === 'player') {
      const p = piece.data as Player;
      return {
        name: p.name,
        sub: `${p.position} · ${p.age} yrs · ${p.rating} OVR`,
        sal: fmtSalary(p.salary),
        yrs: `${p.contractYears}yr`,
        isStar: p.rating >= 88,
      };
    }
    const pick = piece.data as DraftPick;
    const yr = pick.year ?? league.season;
    const rd = pick.round === 1 ? '1st' : '2nd';
    const prot =
      pick.protection === 'top-10-protected'    ? 'Top-10 Prot.'
      : pick.protection === 'lottery-protected' ? 'Lottery Prot.'
      : 'Unprotected';
    return {
      name: `${yr} ${rd}-Round Pick`,
      sub: prot,
      sal: null,
      yrs: null,
      isStar: pick.round === 1 && pick.protection !== 'top-10-protected' && pick.protection !== 'lottery-protected',
    };
  };

  // Quick fairness estimate from user's perspective
  const fairnessLabel = (proposal: TradeProposal): { label: string; color: string } => {
    const receive = proposal.partnerPieces
      .filter(p => p.type === 'player')
      .reduce((s, p) => s + playerTradeValue(p.data as Player), 0)
      + proposal.partnerPieces.filter(p => p.type === 'pick').length * 20;
    const send = proposal.userPieces
      .filter(p => p.type === 'player')
      .reduce((s, p) => s + playerTradeValue(p.data as Player), 0)
      + proposal.userPieces.filter(p => p.type === 'pick').length * 20;
    const ratio = send > 0 ? receive / send : 1;
    if (ratio >= 1.10) return { label: 'Favorable for you', color: 'text-emerald-400' };
    if (ratio >= 0.90) return { label: 'Fair value', color: 'text-amber-400' };
    return { label: 'Below market', color: 'text-rose-400' };
  };

  const handleReject = (proposal: TradeProposal) => {
    updateLeague({
      incomingTradeProposals: (league.incomingTradeProposals ?? []).map(p =>
        p.id === proposal.id ? { ...p, status: 'rejected' as const } : p
      ),
    });
  };

  const ProposalCard = ({ proposal }: { proposal: TradeProposal }) => {
    const aiTeam = league.teams.find(t => t.id === proposal.partnerTeamId);
    if (!aiTeam) return null;
    const { label: fairLabel, color: fairColor } = fairnessLabel(proposal);
    const isPending = proposal.status === 'incoming';

    return (
      <div className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all ${isPending ? 'border-slate-700 hover:border-slate-600' : 'border-slate-800 opacity-60'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-slate-950 text-sm shrink-0"
              style={{ backgroundColor: aiTeam.primaryColor }}
            >
              {aiTeam.abbreviation.slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold text-sm text-white">{aiTeam.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Day {proposal.date} · {aiTeam.aiGM?.personality}</p>
            </div>
          </div>
          <span className={`text-[11px] font-semibold ${fairColor}`}>{fairLabel}</span>
        </div>

        {/* Trade pieces */}
        <div className="grid grid-cols-2 divide-x divide-slate-800">
          {/* You receive */}
          <div className="p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3">You Receive</p>
            {proposal.partnerPieces.map((piece, i) => {
              const fmt = formatPiece(piece);
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 text-[9px] font-bold ${piece.type === 'pick' ? 'bg-amber-500/20 text-amber-400' : fmt.isStar ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-400'}`}>
                    {piece.type === 'pick' ? '📋' : fmt.isStar ? '★' : '▸'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate leading-tight">{fmt.name}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{fmt.sub}</p>
                    {fmt.sal && <p className="text-[10px] text-slate-600">{fmt.sal} · {fmt.yrs}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* You give */}
          <div className="p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-3">You Give</p>
            {proposal.userPieces.map((piece, i) => {
              const fmt = formatPiece(piece);
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 text-[9px] font-bold ${piece.type === 'pick' ? 'bg-amber-500/20 text-amber-400' : fmt.isStar ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-400'}`}>
                    {piece.type === 'pick' ? '📋' : fmt.isStar ? '★' : '▸'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate leading-tight">{fmt.name}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{fmt.sub}</p>
                    {fmt.sal && <p className="text-[10px] text-slate-600">{fmt.sal} · {fmt.yrs}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2 px-4 pb-4 pt-3 border-t border-slate-800 bg-slate-950/30">
            <button
              onClick={() => onAccept(proposal)}
              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-bold transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onCounter(proposal)}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-[13px] font-semibold transition-colors"
            >
              Counter
            </button>
            <button
              onClick={() => handleReject(proposal)}
              className="flex-1 py-2 px-3 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-rose-300 text-[13px] font-semibold transition-colors"
            >
              Reject
            </button>
          </div>
        )}
        {!isPending && (
          <div className="px-4 py-2 border-t border-slate-800">
            <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Rejected</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Trade Proposals</h1>
          <p className="text-slate-500 text-sm mt-1">Incoming offers from AI GMs. New proposals arrive periodically during the season.</p>
        </div>
        {pending.length > 0 && (
          <span className="bg-amber-500 text-slate-950 text-sm font-black px-3 py-1 rounded-full animate-pulse">
            {pending.length} PENDING
          </span>
        )}
      </div>

      {/* Pending proposals */}
      {pending.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-slate-400 font-semibold text-lg">No incoming proposals right now.</p>
          <p className="text-slate-600 text-sm mt-1">AI GMs will reach out as the season progresses. Check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map(p => <ProposalCard key={p.id} proposal={p} />)}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Recent History</h2>
          <div className="grid gap-3 md:grid-cols-2 opacity-70">
            {history.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeProposals;
