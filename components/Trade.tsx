import React, { useState, useMemo, useEffect } from 'react';
import { LeagueState, Team, Player, DraftPick, TradePiece, TradeProposal, Position, Transaction, RivalryStats } from '../types';
import TeamBadge from './TeamBadge';
import { snapshotPlayerStats } from '../utils/playerUtils';
import OwnerReactionModal from './OwnerReactionModal';
import { calcTradeReaction, OwnerReaction } from '../utils/ownerReactionEngine';
import { fmtSalary } from '../utils/formatters';

interface TradeProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  recordTransaction: (state: LeagueState, type: any, teamIds: string[], description: string, playerIds?: string[], value?: number) => Transaction[];
  initialProposal?: TradeProposal | null;
  onClearInitialProposal?: () => void;
}

const Trade: React.FC<TradeProps> = ({ league, updateLeague, recordTransaction, initialProposal, onClearInitialProposal }) => {
  const [activeSubTab, setActiveSubTab] = useState<'machine' | 'finder' | 'block' | 'saved'>('machine');
  const [partnerTeamId, setPartnerTeamId] = useState<string>(
    league.teams.find(t => t.id !== league.userTeamId)?.id || ''
  );
  const [userPieces, setUserPieces] = useState<TradePiece[]>([]);
  const [partnerPieces, setPartnerPieces] = useState<TradePiece[]>([]);
  const [aiResponse, setAiResponse] = useState<{ status: 'neutral' | 'accept' | 'reject' | 'insulted'; message: string }>({
    status: 'neutral',
    message: 'Assemble a package to start negotiations.'
  });
  const [counterPick, setCounterPick] = useState<DraftPick | null>(null);

  // Finder State
  const [finderPos, setFinderPos] = useState<Position | 'ALL'>('ALL');
  const [finderMaxSalary, setFinderMaxSalary] = useState(50000000);
  const [finderResults, setFinderResults] = useState<{ player: Player, team: Team }[]>([]);
  // Approval feedback shown briefly after executing a trade
  const [tradeApproval, setTradeApproval] = useState<{ ownerDelta: number; fanDelta: number } | null>(null);
  // Pending trade execution waiting for owner confirmation
  const [pendingTrade, setPendingTrade] = useState<{
    updatedTeams: Team[];
    updatedTransactions: Transaction[];
    rivalryHistory: RivalryStats[];
    ownerDelta: number;
    fanDelta: number;
    reaction: OwnerReaction;
  } | null>(null);

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const partnerTeam = league.teams.find(t => t.id === partnerTeamId)!;

  const isDeadlinePassed = !!league.tradeDeadlinePassed;

  // Pre-fill trade machine when counter-proposing from Trade Proposals tab
  useEffect(() => {
    if (!initialProposal) return;
    setPartnerTeamId(initialProposal.partnerTeamId);
    // For a counter: swap what user gives/receives so user can adjust from the AI's offer
    setUserPieces(initialProposal.userPieces);
    setPartnerPieces(initialProposal.partnerPieces);
    setActiveSubTab('machine');
    onClearInitialProposal?.();
  }, [initialProposal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Asset Value Calculation
  const getAssetValue = (piece: TradePiece, forTeam: Team): number => {
    if (piece.type === 'player') {
      const p = piece.data as Player;
      const isContender = forTeam.finances.ownerGoal === 'Win Now' || forTeam.wins > forTeam.losses;
      const onBlock = p.onTradeBlock ? 0.85 : 1.0;
      
      let baseValue = isContender ? p.rating * 22 : (p.rating * 10 + p.potential * 16);
      const agePenalty = Math.max(0, p.age - 26) * 60;
      const contractModifier = (p.contractYears * 120);
      
      // Need multiplier
      const needsPos = forTeam.needs?.includes(p.position);
      const needBonus = needsPos ? 1.2 : 1.0;

      return Math.max(100, (baseValue - agePenalty + contractModifier) * onBlock * needBonus);
    } else {
      return pickTradeValue(piece.data as DraftPick);
    }
  };

  const userPiecesValue = userPieces.reduce((sum, p) => sum + getAssetValue(p, partnerTeam), 0);
  const partnerPiecesValue = partnerPieces.reduce((sum, p) => sum + getAssetValue(p, userTeam), 0);

  const userOutgoingSalary = userPieces.reduce((sum, p) => sum + (p.type === 'player' ? (p.data as Player).salary : 0), 0);
  const partnerOutgoingSalary = partnerPieces.reduce((sum, p) => sum + (p.type === 'player' ? (p.data as Player).salary : 0), 0);

  const formatMoney = fmtSalary;

  // ── Pick helpers ──────────────────────────────────────────────────────────
  const pickLabel = (pick: DraftPick): string => {
    const yr = pick.year ?? league.season;
    const round = pick.round === 1 ? '1st' : '2nd';
    return `${yr} ${round}`;
  };

  const pickProtectionLabel = (pick: DraftPick): string => {
    if (pick.protection === 'top-10-protected') return 'Top-10 Prot.';
    if (pick.protection === 'lottery-protected') return 'Lottery Prot.';
    return 'Unprotected';
  };

  const pickTier = (pick: DraftPick): { label: string; color: string } => {
    if (pick.round === 2) return { label: 'LOW', color: 'text-slate-400' };
    const pos = pick.pick > 0 ? pick.pick : 15;
    if (pos <= 5) return { label: 'HIGH', color: 'text-amber-400' };
    if (pos <= 14) return { label: 'MED', color: 'text-blue-400' };
    return { label: 'LOW', color: 'text-slate-400' };
  };

  // Trade machine pick value (separate from aiGMEngine.ts — uses UI-scale numbers)
  const pickTradeValue = (pick: DraftPick): number => {
    const pos = pick.pick > 0 ? pick.pick : 15;
    let base: number;
    if (pick.round === 1) {
      if (pos <= 5)       base = 3500;
      else if (pos <= 14) base = 2500;
      else                base = 1600;
    } else {
      base = 700;
    }
    const originalTeam = league.teams.find(t => t.id === pick.originalTeamId);
    const badTeamMult = originalTeam
      ? 1 + (originalTeam.losses / ((originalTeam.wins + originalTeam.losses) || 1)) * 0.5
      : 1;
    base *= badTeamMult;
    // 15% year discount per season out
    if (pick.year && pick.year > league.season) {
      base *= Math.pow(0.85, pick.year - league.season);
    }
    // Protection discount
    if (pick.protection === 'top-10-protected') base *= 0.85;
    if (pick.protection === 'lottery-protected') base *= 0.70;
    return base;
  };

  const userTeamSalary = userTeam.roster.reduce((sum, p) => sum + p.salary, 0);
  const partnerTeamSalary = partnerTeam.roster.reduce((sum, p) => sum + p.salary, 0);
  const capLimit = 140000000;

  const userCapPass = userTeamSalary - userOutgoingSalary + partnerOutgoingSalary <= capLimit || partnerOutgoingSalary <= userOutgoingSalary * 1.25 + 100000;
  const partnerCapPass = partnerTeamSalary - partnerOutgoingSalary + userOutgoingSalary <= capLimit || userOutgoingSalary <= partnerOutgoingSalary * 1.25 + 100000;

  const canPropose = (userPieces.length > 0 || partnerPieces.length > 0) && !isDeadlinePassed;

  const handlePropose = () => {
    if (isDeadlinePassed) {
      setAiResponse({ status: 'reject', message: 'The trade deadline has passed. No trades can be made until next season.' });
      return;
    }
    if (!userCapPass || !partnerCapPass) {
      setAiResponse({ status: 'reject', message: 'Salary cap rules violation. Salaries must match within 125%.' });
      return;
    }
    setCounterPick(null);
    const valueRatio = userPiecesValue / (partnerPiecesValue || 1);
    if (valueRatio >= 1.15) {
      setAiResponse({ status: 'accept', message: `We accept! The ${partnerTeam.name} front office is thrilled with this value.` });
    } else if (valueRatio >= 0.80) {
      // Try to find a partner future pick that bridges the value gap
      const gap = userPiecesValue - partnerPiecesValue;
      const alreadyInPackage = new Set(
        partnerPieces.filter(p => p.type === 'pick').map(p => {
          const pk = p.data as DraftPick;
          return `${pk.originalTeamId}-${pk.round}-${pk.year}`;
        })
      );
      const bridgePick = [...partnerTeam.picks]
        .filter(p => p.year !== undefined && p.year > league.season &&
          !alreadyInPackage.has(`${p.originalTeamId}-${p.round}-${p.year}`)
        )
        .sort((a, b) => Math.abs(pickTradeValue(a) - gap) - Math.abs(pickTradeValue(b) - gap))[0] ?? null;

      if (bridgePick) {
        setCounterPick(bridgePick);
        const yr = bridgePick.year!;
        const rd = bridgePick.round === 1 ? '1st' : '2nd';
        const prot = pickProtectionLabel(bridgePick);
        setAiResponse({ status: 'reject', message: `Interesting. We could sweeten this by adding our ${yr} ${rd}-round pick (${prot}). See counter below.` });
      } else {
        setAiResponse({ status: 'reject', message: 'Interesting, but you need to sweeten the deal. Add a future pick or a young prospect.' });
      }
    } else {
      setAiResponse({ status: 'insulted', message: 'This is not even close. We are hanging up the phone.' });
    }
  };

  const executeTrade = () => {
    // Snapshot stats for traded players before moving them
    const season = league.season;
    const snappedUserPlayers = userPieces
      .filter(p => p.type === 'player')
      .map(p => snapshotPlayerStats(p.data as Player, userTeam.id, userTeam.name, userTeam.abbreviation, season, true));
    const snappedPartnerPlayers = partnerPieces
      .filter(p => p.type === 'player')
      .map(p => snapshotPlayerStats(p.data as Player, partnerTeam.id, partnerTeam.name, partnerTeam.abbreviation, season, true));

    let updatedTeams = league.teams.map(t => {
      let roster = [...t.roster];
      let picks = [...t.picks];
      const pickMatch = (tradePiece: TradePiece, teamPick: DraftPick) => {
        if (tradePiece.type !== 'pick') return false;
        const tp = tradePiece.data as DraftPick;
        return tp.originalTeamId === teamPick.originalTeamId && tp.round === teamPick.round && tp.year === teamPick.year;
      };
      if (t.id === userTeam.id) {
        roster = roster.filter(p => !userPieces.some(up => up.type === 'player' && (up.data as Player).id === p.id));
        picks = picks.filter(p => !userPieces.some(up => pickMatch(up, p)));
        roster = [...roster, ...snappedPartnerPlayers];
        picks = [...picks, ...partnerPieces.filter(p => p.type === 'pick').map(p => ({ ...(p.data as DraftPick), currentTeamId: userTeam.id }))];
      }
      if (t.id === partnerTeam.id) {
        roster = roster.filter(p => !partnerPieces.some(pp => pp.type === 'player' && (pp.data as Player).id === p.id));
        picks = picks.filter(p => !partnerPieces.some(pp => pickMatch(pp, p)));
        roster = [...roster, ...snappedUserPlayers];
        picks = [...picks, ...userPieces.filter(p => p.type === 'pick').map(p => ({ ...(p.data as DraftPick), currentTeamId: partnerTeam.id }))];
      }
      return { ...t, roster, picks };
    });

    const fmtPiece = (p: TradePiece) => {
      if (p.type === 'player') return (p.data as Player).name;
      const pk = p.data as DraftPick;
      const yr = pk.year ?? league.season;
      const rd = pk.round === 1 ? '1st' : '2nd';
      const prot = pk.protection === 'top-10-protected' ? ' (Top-10 Prot.)' : pk.protection === 'lottery-protected' ? ' (Lottery Prot.)' : ' (Unprotected)';
      return `${yr} ${rd}${prot}`;
    };
    const userGiving = userPieces.map(fmtPiece).join(', ');
    const partnerGiving = partnerPieces.map(fmtPiece).join(', ');
    const description = `${userTeam.name} trade ${userGiving} to ${partnerTeam.name} for ${partnerGiving}.`;
    const playerIds = [
      ...userPieces.filter(p => p.type === 'player').map(p => (p.data as Player).id),
      ...partnerPieces.filter(p => p.type === 'player').map(p => (p.data as Player).id)
    ];

    const updatedTransactions = recordTransaction(league, 'trade', [userTeam.id, partnerTeam.id], description, playerIds, userOutgoingSalary + partnerOutgoingSalary);

    // Update Rivalry Bad Blood
    const rivalryHistory = [...(league.rivalryHistory || [])];
    let rivalry = rivalryHistory.find(r => 
      (r.team1Id === userTeam.id && r.team2Id === partnerTeam.id) || 
      (r.team1Id === partnerTeam.id && r.team2Id === userTeam.id)
    );
    if (rivalry) {
      rivalry.badBloodScore += 3;
    } else {
      rivalryHistory.push({
        team1Id: userTeam.id,
        team2Id: partnerTeam.id,
        team1Wins: 0,
        team2Wins: 0,
        totalGames: 0,
        lastFiveGames: [],
        playoffSeriesCount: 0,
        buzzerBeaters: 0,
        comebacks: 0,
        otGames: 0,
        badBloodScore: 3
      });
    }

    // ── Approval impact — show owner modal before finalizing ─────────────────
    const reaction = calcTradeReaction(userPieces, partnerPieces, league);
    setPendingTrade({
      updatedTeams,
      updatedTransactions,
      rivalryHistory,
      ownerDelta: reaction.ownerDelta,
      fanDelta: reaction.fanDelta,
      reaction,
    });
  };

  const finalizeTradeExecution = () => {
    if (!pendingTrade) return;
    const newOwner = Math.max(0, Math.min(100, (league.ownerApproval ?? 55) + pendingTrade.ownerDelta));
    const newFan   = Math.max(0, Math.min(100, (league.fanApproval   ?? 60) + pendingTrade.fanDelta));
    updateLeague({
      teams: pendingTrade.updatedTeams,
      transactions: pendingTrade.updatedTransactions,
      rivalryHistory: pendingTrade.rivalryHistory,
      ownerApproval: newOwner,
      fanApproval: newFan,
    });
    setUserPieces([]);
    setPartnerPieces([]);
    if (pendingTrade.ownerDelta !== 0) setTradeApproval({ ownerDelta: pendingTrade.ownerDelta, fanDelta: pendingTrade.fanDelta });
    setAiResponse({ status: 'neutral', message: 'Trade finalized! Roster updates complete.' });
    setPendingTrade(null);
  };

  const handleSaveTrade = () => {
    const newProposal: TradeProposal = {
      id: `saved-${Date.now()}`,
      partnerTeamId: partnerTeam.id,
      userPieces: [...userPieces],
      partnerPieces: [...partnerPieces],
      date: league.currentDay,
      status: 'saved'
    };
    updateLeague({ savedTrades: [...(league.savedTrades || []), newProposal] });
    alert('Trade package saved to dashboard.');
  };

  const handleLoadSaved = (saved: TradeProposal) => {
    setPartnerTeamId(saved.partnerTeamId);
    setUserPieces(saved.userPieces);
    setPartnerPieces(saved.partnerPieces);
    setActiveSubTab('machine');
  };

  const handleRunFinder = () => {
    const results = league.teams
      .filter(t => t.id !== userTeam.id)
      .flatMap(t => t.roster.map(p => ({ player: p, team: t })))
      .filter(entry => {
        const matchesPos = finderPos === 'ALL' || entry.player.position === finderPos;
        const matchesSalary = entry.player.salary <= finderMaxSalary;
        return matchesPos && matchesSalary;
      })
      .sort((a,b) => b.player.rating - a.player.rating)
      .slice(0, 15);
    setFinderResults(results);
  };

  const isSamePiece = (a: TradePiece, b: TradePiece): boolean => {
    if (a.type !== b.type) return false;
    if (a.type === 'player') return (a.data as Player).id === (b.data as Player).id;
    const pa = a.data as DraftPick, pb = b.data as DraftPick;
    return pa.originalTeamId === pb.originalTeamId && pa.round === pb.round && pa.year === pb.year;
  };

  const TogglePiece = (piece: TradePiece, isUser: boolean) => {
    const list = isUser ? userPieces : partnerPieces;
    const setter = isUser ? setUserPieces : setPartnerPieces;
    const exists = list.some(p => isSamePiece(p, piece));
    if (exists) setter(list.filter(p => !isSamePiece(p, piece)));
    else setter([...list, piece]);
    setAiResponse({ status: 'neutral', message: 'Negotiating...' });
    setCounterPick(null);
  };

  const PieceItem: React.FC<{ piece: TradePiece, isUser: boolean, isSelected: boolean }> = ({ piece, isUser, isSelected }) => {
    const isPick = piece.type === 'pick';
    const pick = isPick ? piece.data as DraftPick : null;
    const tier = pick ? pickTier(pick) : null;
    const origAbbr = pick ? (league.teams.find(t => t.id === pick.originalTeamId)?.abbreviation ?? pick.originalTeamId) : null;
    return (
      <button
        onClick={() => TogglePiece(piece, isUser)}
        className={`w-full text-left p-3 rounded-xl border transition-all mb-2 flex items-center justify-between group ${isSelected ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-slate-950 text-amber-500' : 'bg-slate-900 text-slate-500'}`}>
            {isPick ? (pick!.round === 1 ? 'R1' : 'R2') : (piece.data as Player).position}
          </div>
          <div>
            <p className="font-bold text-sm uppercase truncate max-w-[130px]">
              {isPick ? pickLabel(pick!) : (piece.data as Player).name}
            </p>
            <p className={`text-[9px] font-black uppercase ${isSelected ? 'text-slate-800' : 'text-slate-500'}`}>
              {isPick
                ? `${origAbbr} • ${pickProtectionLabel(pick!)} • `
                : `Rating: ${(piece.data as Player).rating} • ${formatMoney((piece.data as Player).salary)}`
              }
              {isPick && <span className={isSelected ? 'text-slate-800' : tier!.color}>{tier!.label}</span>}
            </p>
          </div>
        </div>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">{isSelected ? '−' : '+'}</span>
      </button>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* ── Owner Reaction Modal ── */}
      {pendingTrade && (
        <OwnerReactionModal
          reaction={pendingTrade.reaction}
          moveType="trade"
          onProceed={finalizeTradeExecution}
          onCancel={() => { setPendingTrade(null); setAiResponse({ status: 'accepted', message: 'Trade proposal accepted — confirm to finalize.' }); }}
        />
      )}
      {isDeadlinePassed && (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded-2xl px-6 py-4 flex items-center gap-4">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-rose-400 font-display font-black uppercase tracking-widest text-sm">Trade Deadline Passed</p>
            <p className="text-rose-400/70 text-xs font-bold uppercase mt-0.5">No trades can be made for the remainder of the season. Free agent signings are still available.</p>
          </div>
        </div>
      )}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Trade <span className="text-amber-500">Machine</span></h2>
            <div className="flex gap-4">
               {['machine', 'finder', 'block', 'saved'].map(t => (
                 <button 
                  key={t} onClick={() => setActiveSubTab(t as any)}
                  className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${activeSubTab === t ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                 >
                   {t}
                 </button>
               ))}
            </div>
          </div>
          <div className="flex gap-4">
             <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Available Cap</p>
                <p className={`text-2xl font-display font-bold ${userTeam.budget - userTeamSalary > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {formatMoney(userTeam.budget - userTeamSalary)}
                </p>
             </div>
          </div>
        </div>
      </header>

      {activeSubTab === 'machine' && (
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-8">
          {/* User Side */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               Your Assets
            </h3>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
               {userTeam.roster.sort((a,b) => b.rating - a.rating).map(p => (
                 <PieceItem key={p.id} piece={{ type: 'player', data: p }} isUser={true} isSelected={userPieces.some(up => up.type === 'player' && (up.data as Player).id === p.id)} />
               ))}
               <div className="mt-6 pt-6 border-t border-slate-800">
                 {(() => {
                   const curPicks = userTeam.picks.filter(p => !p.year || p.year <= league.season);
                   const futurePicks = userTeam.picks.filter(p => p.year && p.year > league.season).sort((a, b) => (a.year! - b.year!) || (a.round - b.round));
                   const isPickSel = (pick: DraftPick) => userPieces.some(up => up.type === 'pick' && isSamePiece(up, { type: 'pick', data: pick }));
                   return (<>
                     {curPicks.length > 0 && (<>
                       <h4 className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest">This Season's Picks</h4>
                       {curPicks.map((pick, i) => <PieceItem key={`cur-${i}`} piece={{ type: 'pick', data: pick }} isUser={true} isSelected={isPickSel(pick)} />)}
                     </>)}
                     {futurePicks.length > 0 && (<>
                       <h4 className="text-[10px] font-black text-slate-600 uppercase mb-3 mt-4 tracking-widest">Future Draft Picks</h4>
                       {futurePicks.map((pick, i) => <PieceItem key={`fut-${i}-${pick.year}-${pick.round}`} piece={{ type: 'pick', data: pick }} isUser={true} isSelected={isPickSel(pick)} />)}
                     </>)}
                     {curPicks.length === 0 && futurePicks.length === 0 && <p className="text-[10px] text-slate-600 italic">No picks available.</p>}
                   </>);
                 })()}
               </div>
            </div>
          </div>

          {/* Negotiator Middle */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-8 flex-1">
               <div className="flex justify-between items-center pb-6 border-b border-slate-800">
                  <div className="text-center">
                     <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Giving</p>
                     <p className="text-2xl font-display font-bold text-white">{formatMoney(userOutgoingSalary)}</p>
                  </div>
                  <div className="text-center">
                     <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Receiving</p>
                     <p className="text-2xl font-display font-bold text-white">{formatMoney(partnerOutgoingSalary)}</p>
                  </div>
               </div>

               <div className={`p-6 rounded-2xl border transition-all ${aiResponse.status === 'insulted' ? 'bg-rose-500/10 border-rose-500/30' : aiResponse.status === 'accept' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-950 border-slate-800'}`}>
                  <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Partner Stance</p>
                  <p className={`text-lg font-medium italic ${aiResponse.status === 'accept' ? 'text-emerald-400' : aiResponse.status === 'reject' ? 'text-amber-500' : aiResponse.status === 'insulted' ? 'text-rose-500' : 'text-slate-400'}`}>
                    "{aiResponse.message}"
                  </p>
               </div>

               {/* ── Approval feedback toast (shown after trade executes) ── */}
               {tradeApproval && (
                 <div className={`rounded-2xl border p-4 flex items-center justify-between animate-in fade-in duration-500 ${
                   tradeApproval.ownerDelta >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
                 }`}>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approval Impact</p>
                   <div className="flex items-center gap-4 text-sm font-black">
                     <span className={tradeApproval.ownerDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                       👔 Owner {tradeApproval.ownerDelta >= 0 ? '+' : ''}{tradeApproval.ownerDelta}
                     </span>
                     <span className={tradeApproval.fanDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                       📣 Fans {tradeApproval.fanDelta >= 0 ? '+' : ''}{tradeApproval.fanDelta}
                     </span>
                   </div>
                 </div>
               )}

               <div className="space-y-3">
                 <button onClick={handlePropose} disabled={!canPropose} className="w-full py-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-20 text-slate-950 font-display font-bold uppercase rounded-2xl shadow-xl">Propose Trade</button>
                 {aiResponse.status === 'accept' && <button onClick={executeTrade} className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold uppercase rounded-2xl animate-bounce">Confirm Trade</button>}
                 {counterPick && (
                   <button
                     onClick={() => {
                       setPartnerPieces([...partnerPieces, { type: 'pick', data: counterPick }]);
                       setCounterPick(null);
                       setAiResponse({ status: 'neutral', message: `Counter accepted — ${pickLabel(counterPick)} (${pickProtectionLabel(counterPick)}) added to their package.` });
                     }}
                     className="w-full py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/40 text-blue-300 font-display font-bold uppercase text-sm rounded-2xl transition-all"
                   >
                     Accept Counter: + {pickLabel(counterPick)} ({pickProtectionLabel(counterPick)})
                   </button>
                 )}
                 <button onClick={handleSaveTrade} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold uppercase rounded-2xl">Save Package</button>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border text-center ${userCapPass ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/5 border-rose-500/20 text-rose-500'}`}>
                     <p className="text-[8px] font-black uppercase mb-1">User Cap</p>
                     <p className="text-xs font-bold">{userCapPass ? 'VALID' : 'FAIL'}</p>
                  </div>
                  <div className={`p-4 rounded-xl border text-center ${partnerCapPass ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/5 border-rose-500/20 text-rose-500'}`}>
                     <p className="text-[8px] font-black uppercase mb-1">Partner Cap</p>
                     <p className="text-xs font-bold">{partnerCapPass ? 'VALID' : 'FAIL'}</p>
                  </div>
               </div>
            </div>
          </div>

          {/* Partner Side */}
          <div className="lg:col-span-2 space-y-4">
            <select 
               className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white mb-2"
               value={partnerTeamId}
               onChange={(e) => { setPartnerTeamId(e.target.value); setPartnerPieces([]); }}
            >
               {league.teams.filter(t => t.id !== userTeam.id).map(t => (
                 <option key={t.id} value={t.id}>{t.city} {t.name}</option>
               ))}
            </select>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
               {partnerTeam.roster.sort((a,b) => b.rating - a.rating).map(p => (
                 <PieceItem key={p.id} piece={{ type: 'player', data: p }} isUser={false} isSelected={partnerPieces.some(pp => pp.type === 'player' && (pp.data as Player).id === p.id)} />
               ))}
               <div className="mt-6 pt-6 border-t border-slate-800">
                 {(() => {
                   const curPicks = partnerTeam.picks.filter(p => !p.year || p.year <= league.season);
                   const futurePicks = partnerTeam.picks.filter(p => p.year && p.year > league.season).sort((a, b) => (a.year! - b.year!) || (a.round - b.round));
                   const isPickSel = (pick: DraftPick) => partnerPieces.some(pp => pp.type === 'pick' && isSamePiece(pp, { type: 'pick', data: pick }));
                   return (<>
                     {curPicks.length > 0 && (<>
                       <h4 className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest">This Season's Picks</h4>
                       {curPicks.map((pick, i) => <PieceItem key={`cur-${i}`} piece={{ type: 'pick', data: pick }} isUser={false} isSelected={isPickSel(pick)} />)}
                     </>)}
                     {futurePicks.length > 0 && (<>
                       <h4 className="text-[10px] font-black text-slate-600 uppercase mb-3 mt-4 tracking-widest">Future Draft Picks</h4>
                       {futurePicks.map((pick, i) => <PieceItem key={`fut-${i}-${pick.year}-${pick.round}`} piece={{ type: 'pick', data: pick }} isUser={false} isSelected={isPickSel(pick)} />)}
                     </>)}
                     {curPicks.length === 0 && futurePicks.length === 0 && <p className="text-[10px] text-slate-600 italic">No picks available.</p>}
                   </>);
                 })()}
               </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'finder' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col md:flex-row items-end gap-6 shadow-2xl">
             <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Position Target</label>
                <select value={finderPos} onChange={(e) => setFinderPos(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white">
                   <option value="ALL">All Positions</option>
                   <option value="PG">Point Guard</option>
                   <option value="SG">Shooting Guard</option>
                   <option value="SF">Small Forward</option>
                   <option value="PF">Power Forward</option>
                   <option value="C">Center</option>
                </select>
             </div>
             <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Max Salary Cap Hit</label>
                <select value={finderMaxSalary} onChange={(e) => setFinderMaxSalary(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white">
                   <option value={10000000}>Under $10M</option>
                   <option value={25000000}>Under $25M</option>
                   <option value={50000000}>Under $50M</option>
                </select>
             </div>
             <button onClick={handleRunFinder} className="px-12 py-3.5 bg-amber-500 text-slate-950 font-display font-bold uppercase rounded-xl">Search Targets</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {finderResults.map(entry => (
                <div key={entry.player.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 hover:border-amber-500 transition-all group">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         <h4 className="text-xl font-display font-bold text-white uppercase">{entry.player.name}</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase">{entry.team.name} • {entry.player.position}</p>
                      </div>
                      <span className="text-2xl font-display font-bold text-amber-500">{entry.player.rating}</span>
                   </div>
                   <div className="space-y-2 text-xs font-bold text-slate-400">
                      <p>Salary: <span className="text-white">{formatMoney(entry.player.salary)}</span></p>
                      <p>Contract: <span className="text-white">{entry.player.contractYears}Y Left</span></p>
                   </div>
                   <button 
                     onClick={() => { setPartnerTeamId(entry.team.id); setPartnerPieces([{ type: 'player', data: entry.player }]); setActiveSubTab('machine'); }}
                     className="w-full mt-6 py-3 bg-slate-800 group-hover:bg-amber-500 group-hover:text-slate-950 text-[10px] font-black uppercase rounded-xl transition-all"
                   >
                      Add to Trade Machine
                   </button>
                </div>
             ))}
          </div>
        </div>
      )}

      {activeSubTab === 'block' && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
               <h3 className="text-xl font-display font-bold text-white uppercase mb-6">Trading Block Targets</h3>
               <div className="space-y-4">
                  {league.teams.flatMap(t => t.roster.filter(p => p.onTradeBlock).map(p => ({ p, t }))).map(entry => (
                    <div key={entry.p.id} className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center font-bold text-slate-500">{entry.p.position}</div>
                          <div>
                             <p className="font-bold text-slate-200">{entry.p.name}</p>
                             <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest">Wants to Move</p>
                          </div>
                       </div>
                       <button 
                         onClick={() => { setPartnerTeamId(entry.t.id); setPartnerPieces([{ type: 'player', data: entry.p }]); setActiveSubTab('machine'); }}
                         className="px-4 py-2 bg-slate-800 hover:bg-amber-500 text-[10px] font-black uppercase rounded-lg"
                       >
                         Negotiate
                       </button>
                    </div>
                  ))}
                  {league.teams.every(t => !t.roster.some(p => p.onTradeBlock)) && <p className="text-slate-600 italic">No players currently on the public trade block.</p>}
               </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
               <h3 className="text-xl font-display font-bold text-white uppercase mb-6">Franchise Needs</h3>
               <div className="space-y-4">
                  {league.teams.slice(0, 10).map(t => (
                    <div key={t.id} className="flex justify-between items-center border-b border-slate-800 pb-3">
                       <div className="flex items-center gap-3">
                          <TeamBadge team={t} size="xs" />
                          <span className="text-sm font-bold text-slate-300">{t.name}</span>
                       </div>
                       <div className="flex gap-2">
                          {(t.needs || ['PG', 'C']).map(n => (
                            <span key={n} className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-black rounded border border-amber-500/20">{n}</span>
                          ))}
                       </div>
                    </div>
                  ))}
               </div>
            </div>
         </div>
      )}

      {activeSubTab === 'saved' && (
         <div className="space-y-6 animate-in zoom-in-95 duration-500">
            {league.savedTrades?.map(saved => (
               <div key={saved.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex items-center justify-between shadow-2xl group hover:border-amber-500 transition-all">
                  <div className="flex items-center gap-12">
                     <div className="text-center">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Your Package</p>
                        <p className="text-xl font-display font-bold text-white">{saved.userPieces.length} Assets</p>
                     </div>
                     <div className="text-2xl text-slate-700">⇄</div>
                     <div className="text-center">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Partner Package</p>
                        <p className="text-xl font-display font-bold text-white">{league.teams.find(t => t.id === saved.partnerTeamId)?.name}</p>
                     </div>
                  </div>
                  <div className="flex gap-4">
                     <button onClick={() => handleLoadSaved(saved)} className="px-10 py-3 bg-amber-500 text-slate-950 font-display font-bold uppercase rounded-xl">Re-Open Machine</button>
                     <button 
                       onClick={() => updateLeague({ savedTrades: league.savedTrades.filter(s => s.id !== saved.id) })}
                       className="p-3 bg-slate-800 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 rounded-xl transition-all"
                     >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                     </button>
                  </div>
               </div>
            ))}
            {(!league.savedTrades || league.savedTrades.length === 0) && (
               <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-600">
                  <p className="font-display text-2xl uppercase tracking-widest">No Saved Proposals</p>
                  <p className="text-[10px] font-black uppercase mt-2">Construct a package in the Trade Machine and save it to track values.</p>
               </div>
            )}
         </div>
      )}
    </div>
  );
};

export default Trade;