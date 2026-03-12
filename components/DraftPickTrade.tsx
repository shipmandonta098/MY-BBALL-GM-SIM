import React, { useState, useMemo } from 'react';
import { LeagueState, DraftPick } from '../types';

interface DraftPickTradeProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onClose: () => void;
  preselectedUserPick?: DraftPick;
}

// NBA-style pick value chart (R1: 1-30, R2: 31-60)
const PICK_VALUES_R1 = [
  3000, 2800, 2600, 2400, 2200, 2000, 1800, 1600, 1400, 1200,
  1050,  900,  750,  620,  510,  420,  360,  300,  255,  215,
   185,  160,  140,  125,  112,   100,   90,   80,   70,   62,
];

const getPickValue = (pick: DraftPick): number => {
  if (pick.round === 1) {
    return PICK_VALUES_R1[pick.pick - 1] ?? 60;
  }
  // Round 2: roughly 50 down to 10
  const r2Pos = pick.pick - 30;
  return Math.max(10, Math.round(52 - r2Pos * 1.4));
};

const pickLabel = (p: DraftPick) =>
  `R${p.round} · #${p.round === 1 ? p.pick : p.pick - 30}`;

type TradeResult = 'accepted' | 'declined' | null;

const DraftPickTrade: React.FC<DraftPickTradeProps> = ({
  league,
  updateLeague,
  onClose,
  preselectedUserPick,
}) => {
  const currentIdx = league.currentDraftPickIndex ?? 0;

  const [selectedUserPick, setSelectedUserPick] = useState<DraftPick | null>(
    preselectedUserPick ?? null
  );
  const [partnerTeamId, setPartnerTeamId] = useState('');
  const [selectedPartnerPick, setSelectedPartnerPick] = useState<DraftPick | null>(null);
  const [result, setResult] = useState<TradeResult>(null);
  const [resultMsg, setResultMsg] = useState('');

  // User's future (unmade) picks
  const userPicks = useMemo(
    () =>
      (league.draftPicks ?? []).filter(
        p => p.currentTeamId === league.userTeamId && p.pick > currentIdx
      ),
    [league.draftPicks, league.userTeamId, currentIdx]
  );

  // AI teams
  const aiTeams = league.teams.filter(t => t.id !== league.userTeamId);

  // Partner team's future picks
  const partnerPicks = useMemo(
    () =>
      partnerTeamId
        ? (league.draftPicks ?? []).filter(
            p => p.currentTeamId === partnerTeamId && p.pick > currentIdx
          )
        : [],
    [partnerTeamId, league.draftPicks, currentIdx]
  );

  const partnerTeam = league.teams.find(t => t.id === partnerTeamId);
  const userValue = selectedUserPick ? getPickValue(selectedUserPick) : 0;
  const partnerValue = selectedPartnerPick ? getPickValue(selectedPartnerPick) : 0;
  const ratio = partnerValue > 0 ? userValue / partnerValue : 0;

  const fairness = useMemo(() => {
    if (!selectedUserPick || !selectedPartnerPick) return null;
    if (ratio >= 0.85 && ratio <= 1.18) return { label: 'Fair Trade', color: 'text-emerald-400' };
    if (ratio > 1.18) return { label: 'Favorable for You', color: 'text-blue-400' };
    return { label: 'You Overpay', color: 'text-orange-400' };
  }, [selectedUserPick, selectedPartnerPick, ratio]);

  const handlePropose = () => {
    if (!selectedUserPick || !selectedPartnerPick || !partnerTeam) return;

    const personality = partnerTeam.aiGM?.personality ?? 'Balanced';

    // Base acceptance odds driven by value ratio (user giving / partner giving)
    // ratio > 1 means user overpays → AI more likely to accept
    let chance = 0.35 + (ratio - 1) * 0.55;

    // Personality modifiers
    if (personality === 'Rebuilder') chance += 0.12;       // happy to acquire picks
    if (personality === 'Win Now') chance -= 0.18;          // wants immediate help, not future picks
    if (personality === 'Analytics') chance = ratio >= 0.95 ? 0.7 : 0.18;
    if (personality === 'Loyalist') chance -= 0.05;
    if (personality === 'Superstar Chaser') chance -= 0.1;

    const accepted = Math.random() < Math.min(0.92, Math.max(0.05, chance));

    if (accepted) {
      const updatedPicks = (league.draftPicks ?? []).map(p => {
        if (p.round === selectedUserPick.round && p.pick === selectedUserPick.pick)
          return { ...p, currentTeamId: partnerTeamId };
        if (p.round === selectedPartnerPick.round && p.pick === selectedPartnerPick.pick)
          return { ...p, currentTeamId: league.userTeamId };
        return p;
      });

      const newsItem = {
        id: `pick-trade-${Date.now()}`,
        category: 'transaction' as const,
        headline: '🔀 DRAFT PICK TRADE',
        content: `${league.teams.find(t => t.id === league.userTeamId)?.name} trades ${pickLabel(selectedUserPick)} to ${partnerTeam.name} for ${pickLabel(selectedPartnerPick)}.`,
        timestamp: league.currentDay,
        realTimestamp: Date.now(),
        isBreaking: false,
      };

      updateLeague({ draftPicks: updatedPicks, newsFeed: [newsItem, ...league.newsFeed] });
      setResult('accepted');
      setResultMsg(
        `${partnerTeam.name} agreed! You receive ${pickLabel(selectedPartnerPick)} in exchange for ${pickLabel(selectedUserPick)}.`
      );
    } else {
      setResult('declined');
      setResultMsg(`${partnerTeam.name} declined. They didn't see enough value.`);
    }
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div
          className={`bg-slate-900 border ${result === 'accepted' ? 'border-emerald-500/40' : 'border-red-500/40'} rounded-3xl w-full max-w-md p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300`}
        >
          <div className="text-6xl mb-4">{result === 'accepted' ? '🤝' : '❌'}</div>
          <h3
            className={`text-2xl font-display font-black uppercase mb-3 ${
              result === 'accepted' ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            Trade {result === 'accepted' ? 'Accepted!' : 'Declined'}
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">{resultMsg}</p>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Main modal ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300 scrollbar-thin scrollbar-thumb-slate-700">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-display font-black uppercase text-white">Trade Pick</h2>
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Propose a draft pick swap with an AI team</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Step 1 — Your pick */}
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Step 1 · Your Pick to Give Up
            </h4>
            {userPicks.length === 0 ? (
              <p className="text-slate-600 text-sm italic">No future picks available to trade.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {userPicks.map(p => {
                  const active =
                    selectedUserPick?.pick === p.pick && selectedUserPick?.round === p.round;
                  return (
                    <button
                      key={`u-${p.round}-${p.pick}`}
                      onClick={() => setSelectedUserPick(p)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        active
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase">{pickLabel(p)}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Value: {Math.round(getPickValue(p))}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2 — Partner team */}
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Step 2 · Select a Team
            </h4>
            <select
              value={partnerTeamId}
              onChange={e => {
                setPartnerTeamId(e.target.value);
                setSelectedPartnerPick(null);
              }}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-3 text-sm focus:border-amber-500 focus:outline-none transition-colors"
            >
              <option value="">— Select a team —</option>
              {aiTeams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.city} {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 3 — Partner pick */}
          {partnerTeamId && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                Step 3 · Their Pick to Receive
              </h4>
              {partnerPicks.length === 0 ? (
                <p className="text-slate-600 text-sm italic">This team has no future picks available.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {partnerPicks.map(p => {
                    const active =
                      selectedPartnerPick?.pick === p.pick && selectedPartnerPick?.round === p.round;
                    return (
                      <button
                        key={`p-${p.round}-${p.pick}`}
                        onClick={() => setSelectedPartnerPick(p)}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          active
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <p className="text-[10px] font-black uppercase">{pickLabel(p)}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">Value: {Math.round(getPickValue(p))}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Fair-value summary */}
          {selectedUserPick && selectedPartnerPick && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-center flex-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">You Give</p>
                  <p className="text-lg font-display font-bold text-white">{pickLabel(selectedUserPick)}</p>
                  <p className="text-xs text-slate-500 tabular-nums">Value: {Math.round(userValue)}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-2xl">⇄</p>
                  {fairness && (
                    <p className={`text-[10px] font-black uppercase ${fairness.color}`}>{fairness.label}</p>
                  )}
                </div>
                <div className="text-center flex-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">You Receive</p>
                  <p className="text-lg font-display font-bold text-white">{pickLabel(selectedPartnerPick)}</p>
                  <p className="text-xs text-slate-500 tabular-nums">Value: {Math.round(partnerValue)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-between items-center gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-sm rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handlePropose}
            disabled={!selectedUserPick || !selectedPartnerPick}
            className="px-8 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-black uppercase text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-500/20"
          >
            Propose Trade
          </button>
        </div>
      </div>
    </div>
  );
};

export default DraftPickTrade;
