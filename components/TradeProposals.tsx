import React, { useMemo, useState } from 'react';
import { LeagueState, TradeProposal, TradePiece, Player, DraftPick } from '../types';
import { playerTradeValue } from '../utils/aiGMEngine';
import { fmtSalary } from '../utils/formatters';

interface TradeProposalsProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onAccept: (proposal: TradeProposal) => void;
  onCounter: (proposal: TradeProposal) => void;
  onAcceptRequest: (playerId: string) => void;
  onDeclineRequest: (playerId: string) => void;
}

type TabType = 'proposals' | 'requests';

const TradeProposals: React.FC<TradeProposalsProps> = ({
  league,
  updateLeague,
  onAccept,
  onCounter,
  onAcceptRequest,
  onDeclineRequest,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('proposals');

  const pending  = useMemo(() => (league.incomingTradeProposals ?? []).filter(p => p.status === 'incoming'), [league.incomingTradeProposals]);
  const history  = useMemo(() => (league.incomingTradeProposals ?? []).filter(p => p.status === 'rejected').slice(0, 10), [league.incomingTradeProposals]);

  const userTeam = useMemo(() => league.teams.find(t => t.id === league.userTeamId), [league.teams, league.userTeamId]);
  const tradeRequests = useMemo(() =>
    (userTeam?.roster ?? []).filter(p => p.requestedTrade === true),
    [userTeam]
  );

  // Determine whether the trade window is currently open
  const isPlayoffs    = !!league.playoffBracket;
  const isOffseason   = !!league.isOffseason;
  const deadlinePassed = !!league.tradeDeadlinePassed;
  const windowOpen    = !isOffseason && !deadlinePassed && !isPlayoffs;
  const windowLabel   =
    isPlayoffs    ? 'Playoffs are active — trades are frozen until next season.'
    : deadlinePassed ? 'The trade deadline has passed — no new proposals until next season.'
    : isOffseason   ? 'Trades resume once the regular season begins.'
    : null; // window is open

  // fmtSalary imported from utils/formatters

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

  const ProposalCard: React.FC<{ proposal: TradeProposal }> = ({ proposal }) => {
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
            {windowOpen ? (
              <>
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
              </>
            ) : (
              <p className="text-[11px] text-slate-600 italic px-1">Trade window closed — this offer has expired.</p>
            )}
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

  const RequestCard: React.FC<{ player: Player }> = ({ player }) => {
    const moraleColor =
      player.morale < 30 ? 'text-rose-400' :
      player.morale < 50 ? 'text-amber-400' :
      'text-slate-400';

    return (
      <div className="bg-slate-900 border border-amber-700/40 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-amber-950/30 border-b border-amber-800/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 font-black text-sm shrink-0">
              {player.position}
            </div>
            <div>
              <p className="font-semibold text-sm text-white">{player.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{player.age} yrs · {player.rating} OVR · {player.contractYears}yr left</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest">Trade Request</p>
            <p className={`text-[10px] font-semibold ${moraleColor}`}>Morale {player.morale ?? 75}/100</p>
          </div>
        </div>

        {/* Context */}
        <div className="px-5 py-3">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            {player.name.split(' ')[0]} has formally requested a trade. AI GMs are actively monitoring his availability — accepting will signal the league that he is available for the right package.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">{fmtSalary(player.salary)}/yr</span>
            {player.personalityTraits?.map(t => (
              <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-500">{t}</span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4 pt-2 border-t border-slate-800">
          <button
            onClick={() => onAcceptRequest(player.id)}
            className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-[13px] font-bold transition-colors"
          >
            Accept Request
          </button>
          <button
            onClick={() => onDeclineRequest(player.id)}
            className="flex-1 py-2 px-3 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-rose-300 text-[13px] font-semibold transition-colors"
          >
            Decline (−10 Morale)
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Trade Center</h1>
          <p className="text-slate-500 text-sm mt-1">Incoming offers from AI GMs and player trade requests.</p>
        </div>
        {pending.length > 0 && windowOpen && (
          <span className="bg-amber-500 text-slate-950 text-sm font-black px-3 py-1 rounded-full animate-pulse">
            {pending.length} PENDING
          </span>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('proposals')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'proposals' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Proposals
          {pending.length > 0 && (
            <span className="ml-2 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'requests' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Requests
          {tradeRequests.length > 0 && (
            <span className="ml-2 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{tradeRequests.length}</span>
          )}
        </button>
      </div>

      {/* ── PROPOSALS TAB ── */}
      {activeTab === 'proposals' && (
        <>
          {/* Trade window status banner */}
          {windowLabel && (
            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-semibold ${
              deadlinePassed || isPlayoffs
                ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}>
              <span className="text-lg">{deadlinePassed || isPlayoffs ? '🔒' : '⏳'}</span>
              <span>{windowLabel}</span>
            </div>
          )}

          {/* Pending proposals */}
          {pending.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <p className="text-5xl mb-4">📭</p>
              <p className="text-slate-400 font-semibold text-lg">
                {windowOpen ? 'No incoming proposals right now.' : 'No active proposals.'}
              </p>
              <p className="text-slate-600 text-sm mt-1">
                {windowOpen
                  ? 'AI GMs reach out roughly every 5–10 games. More activity during mid-season and when teams have clear needs.'
                  : 'Proposals will resume at the start of next season.'}
              </p>
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
        </>
      )}

      {/* ── REQUESTS TAB ── */}
      {activeTab === 'requests' && (
        <>
          {tradeRequests.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <p className="text-5xl mb-4">🤝</p>
              <p className="text-slate-400 font-semibold text-lg">No active trade requests.</p>
              <p className="text-slate-600 text-sm mt-1">
                Unhappy Diva/Star players on your roster may formally request a trade when their morale drops below 40.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-amber-950/30 border border-amber-800/40 rounded-2xl px-5 py-3 text-sm text-amber-300 font-semibold flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <span>
                  Accepting a request signals to the league that this player is available. AI GMs will actively shop for a package. Declining hurts morale.
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {tradeRequests.map(p => <RequestCard key={p.id} player={p} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TradeProposals;
