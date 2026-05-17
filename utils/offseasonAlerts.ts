import { LeagueState, OffseasonAlert } from '../types';

/**
 * Build the offseason alert queue shown after the draft lottery / draft completion.
 *
 * Alert order:
 *  1. Summary card — "Your team has X players entering FA"
 *  2. Own free agents sorted by rating (highest first)
 *  3. Up to 3 notable league-wide FAs (OVR ≥ 85, not from user's team)
 */
export const generateOffseasonAlerts = (state: LeagueState): OffseasonAlert[] => {
  const { userTeamId, freeAgents, teams, season } = state;
  const alerts: OffseasonAlert[] = [];

  const ownFAs = freeAgents
    .filter(p => p.lastTeamId === userTeamId)
    .sort((a, b) => b.rating - a.rating);

  // ── 1. Summary ────────────────────────────────────────────────────────────
  if (ownFAs.length > 0) {
    const topNames = ownFAs
      .slice(0, 3)
      .map(p => p.name.split(' ').pop())  // last name only
      .join(', ');
    const extra = ownFAs.length > 3 ? ` and ${ownFAs.length - 3} others` : '';
    alerts.push({
      id: `osa-summary-${season}`,
      type: 'summary',
      playerName: 'Your Roster',
      message: `${ownFAs.length} player${ownFAs.length > 1 ? 's' : ''} from your team ${ownFAs.length > 1 ? 'are' : 'is'} entering free agency this offseason — ${topNames}${extra}. Review your roster and make retention decisions before the market opens.`,
      dismissed: false,
    });
  }

  // ── 2. Own free agents (individual alerts) ────────────────────────────────
  ownFAs.forEach(p => {
    const isRFA = p.faType === 'RFA';
    const statusLabel = isRFA ? 'Restricted Free Agent' : 'Unrestricted Free Agent';
    const retentionNote = isRFA
      ? `As a Restricted Free Agent, you hold the right to match any outside offer.`
      : `As an Unrestricted Free Agent, ${p.name} can sign with any team — including your rivals.`;
    alerts.push({
      id: `osa-own-${p.id}-${season}`,
      type: 'own_fa',
      playerId: p.id,
      playerName: p.name,
      playerRating: p.rating,
      playerPosition: p.position,
      playerAge: p.age,
      faType: p.faType ?? 'UFA',
      message: `${p.name} (${p.position}, ${p.rating} OVR) is now a ${statusLabel}. ${retentionNote}`,
      salary: p.desiredContract?.salary,
      contractYears: p.desiredContract?.years,
      dismissed: false,
    });
  });

  // ── 3. Notable league-wide FAs (OVR ≥ 85, not from user's team) ──────────
  const notableThreshold = (state.settings.playerGenderRatio ?? 0) === 100 ? 80 : 85;
  const notableFAs = freeAgents
    .filter(p => p.lastTeamId !== userTeamId && p.rating >= notableThreshold)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4);

  notableFAs.forEach(p => {
    const prevTeam = teams.find(t => t.id === p.lastTeamId);
    const fromStr   = prevTeam ? `from the ${prevTeam.city} ${prevTeam.name}` : '';
    const faLabel   = p.faType === 'RFA' ? 'Restricted Free Agent' : 'Unrestricted Free Agent';
    const intrigue  = p.rating >= 90
      ? `A player of this caliber rarely hits the open market — this is a franchise-altering opportunity.`
      : `A proven starter who could immediately strengthen your rotation.`;
    alerts.push({
      id: `osa-notable-${p.id}-${season}`,
      type: 'notable_fa',
      playerId: p.id,
      playerName: p.name,
      playerRating: p.rating,
      playerPosition: p.position,
      playerAge: p.age,
      faType: p.faType ?? 'UFA',
      message: `${p.name} ${fromStr} has entered the market as a ${faLabel}. ${intrigue}`,
      salary: p.desiredContract?.salary,
      contractYears: p.desiredContract?.years,
      dismissed: false,
    });
  });

  return alerts;
};
