import React from 'react';
import { Team } from '../types';

interface OwnerWelcomeProps {
  team: Team;
  season: number;
  onContinue: () => void;
}

// ── Deterministic owner name from team id ─────────────────────────────────────
const FIRST_NAMES = [
  'Robert','James','Michael','David','Richard','William','Charles','Joseph',
  'Thomas','Daniel','Margaret','Patricia','Barbara','Susan','Dorothy','Lisa',
  'Nancy','Karen','Betty','Helen',
];
const LAST_NAMES = [
  'Sterling','Johnson','Williams','Peterson','Anderson','Thompson','Mitchell',
  'Hamilton','Brooks','Turner','Blackwell','Harrington','Crawford','Donovan',
  'Fletcher','Gallagher','Holt','Ingram','Jensen','Keller',
];
function ownerNameFromTeam(team: Team): string {
  let hash = 0;
  for (let i = 0; i < team.id.length; i++) hash = (hash * 31 + team.id.charCodeAt(i)) | 0;
  const first = FIRST_NAMES[Math.abs(hash) % FIRST_NAMES.length];
  const last  = LAST_NAMES[Math.abs(hash * 17 + 7) % LAST_NAMES.length];
  return `${first} ${last}`;
}

// ── Message generation ────────────────────────────────────────────────────────
function buildMessage(team: Team, season: number): { greeting: string; body: string[]; closer: string } {
  const { ownerGoal, ownerPatience } = team.finances;
  const market   = team.marketSize;
  const prevWins = team.prevSeasonWins;
  const city     = team.city;
  const name     = team.name;

  // Patience tier: Low (<35), Medium (35-65), High (>65)
  const patience =
    ownerPatience < 35 ? 'low' :
    ownerPatience < 65 ? 'medium' : 'high';

  // Record context
  const hasHistory = prevWins !== undefined;
  const record     = hasHistory
    ? `${prevWins}-${(team.prevSeasonLosses ?? 0)}` : null;
  const wasGood    = hasHistory && (prevWins ?? 0) >= 41;
  const wasBad     = hasHistory && (prevWins ?? 0) < 30;

  // ── Greeting line ─────────────────────────────────────────────────────────
  const greeting =
    patience === 'low'    ? `I'll be brief.` :
    patience === 'medium' ? `Welcome to the ${city} ${name}.` :
                            `Welcome aboard. I'm glad you're here.`;

  // ── Body paragraphs (2-3) ─────────────────────────────────────────────────
  const body: string[] = [];

  // Paragraph 1 — franchise context
  if (ownerGoal === 'Win Now') {
    if (market === 'Large') {
      body.push(
        `This is a major market franchise. We have the resources, the fanbase, and the expectation to win a championship — not next decade, but now. Every decision you make should be pointed at that goal.`
      );
    } else if (market === 'Medium') {
      body.push(
        `We're at a pivotal moment. The roster has talent, the fans are hungry, and there's a real window to compete. I need you to push us over the top and make a genuine run at a title.`
      );
    } else {
      body.push(
        `Small market, big ambitions. We can't outspend the big boys, so you'll need to out-think them. Find the right players, build real chemistry, and get us deep into the playoffs.`
      );
    }
  } else if (ownerGoal === 'Rebuild') {
    if (wasBad) {
      body.push(
        `Look, last season was ${record ? `a ${record} disaster` : 'rough'}. The roster is broken, the culture needs resetting, and we need a complete overhaul. That's why you're here. Don't be afraid to tear it down and build something real.`
      );
    } else {
      body.push(
        `I know what the fans want — wins right now. But I'm thinking long-term. We need to develop our young talent, accumulate assets, and build a foundation that lasts. That may mean some short-term pain.`
      );
    }
  } else {
    // Profit
    body.push(
      `I run this franchise as a business. That means keeping the books clean, staying out of the deep luxury tax, and putting a team on the floor that people want to watch. Wins matter, but so do margins.`
    );
  }

  // Paragraph 2 — record commentary
  if (record) {
    if (wasGood && ownerGoal === 'Win Now') {
      body.push(
        `Last year's ${record} record proved we can compete. Now I expect more. The regular season is just the table-setting — I want a deep playoff run, and I won't accept less.`
      );
    } else if (wasGood && ownerGoal !== 'Win Now') {
      body.push(
        `Last year's ${record} finish showed promise. Use that momentum wisely. Keep developing the young pieces and don't let a few good seasons pressure you into overpaying veterans who don't fit the plan.`
      );
    } else if (wasBad) {
      body.push(
        `The ${record} record last year was unacceptable to this fanbase. I'm not pointing fingers at the past — but I need to see improvement on the floor. Quickly.`
      );
    } else if (hasHistory) {
      body.push(
        `We finished ${record} last year — right in that frustrating middle ground. No lottery, no playoffs. You need to decide: commit to rebuilding or push harder for the postseason. Straddling the line won't cut it.`
      );
    }
  }

  // Paragraph 3 — specific expectations
  if (ownerGoal === 'Profit') {
    body.push(
      market === 'Small'
        ? `Keep us below the luxury tax line, maintain fan attendance, and make sure we're putting together a squad worth buying a ticket to see.`
        : `I expect payroll discipline. Oversized contracts on declining players come out of my pocket. Make smart moves, stay nimble, and keep us out of the tax penalty bracket.`
    );
  } else if (patience === 'low') {
    body.push(
      ownerGoal === 'Win Now'
        ? `I have zero patience for mediocrity. If we're not competing for the top seed, I'll be asking questions. Don't test me.`
        : `I'm giving you two seasons max to show real progress. After that, decisions will be made.`
    );
  } else if (patience === 'high') {
    body.push(
      `I'm a patient man. Build this the right way, develop your players, and trust the process. Just keep me informed and don't make moves that embarrass the franchise.`
    );
  } else {
    body.push(
      ownerGoal === 'Win Now'
        ? `Make the playoffs. That's the baseline. Anything less than a first-round appearance is a failure in this market.`
        : `Show me year-over-year improvement. I don't need a championship tomorrow — but I need to see a clear direction and real development from this group.`
    );
  }

  // ── Closer ────────────────────────────────────────────────────────────────
  const closer =
    patience === 'low' && ownerGoal === 'Win Now' ? `Don't disappoint me.` :
    patience === 'low'  ? `The clock is ticking. Get to work.` :
    patience === 'high' && ownerGoal === 'Rebuild' ? `Take your time — but take us somewhere.` :
    patience === 'high' ? `My door is open. Now go build something we can all be proud of.` :
    ownerGoal === 'Win Now' ? `This city deserves a winner. Let's get them one.` :
    ownerGoal === 'Profit'  ? `Run a tight ship and keep this franchise healthy. I'm counting on you.` :
                              `Build smart. Build to last. Good luck.`;

  return { greeting, body, closer };
}

// ── Personality badge ─────────────────────────────────────────────────────────
function personalityBadge(team: Team): { label: string; color: string } {
  const { ownerGoal, ownerPatience } = team.finances;
  if (ownerPatience < 35 && ownerGoal === 'Win Now')
    return { label: 'Demanding — Win Now',   color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
  if (ownerPatience < 35)
    return { label: 'Impatient',             color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
  if (ownerGoal === 'Win Now' && ownerPatience >= 60)
    return { label: 'Ambitious',             color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  if (ownerGoal === 'Win Now')
    return { label: 'Championship-Focused',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  if (ownerGoal === 'Rebuild' && ownerPatience >= 65)
    return { label: 'Visionary — Long-term', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' };
  if (ownerGoal === 'Rebuild')
    return { label: 'Rebuilding',            color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  if (ownerGoal === 'Profit')
    return { label: 'Business-Minded',       color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  return   { label: 'Supportive',            color: 'bg-slate-600/30 text-slate-300 border-slate-500/30' };
}

// ── Component ─────────────────────────────────────────────────────────────────
const OwnerWelcome: React.FC<OwnerWelcomeProps> = ({ team, season, onContinue }) => {
  const ownerName = ownerNameFromTeam(team);
  const badge     = personalityBadge(team);
  const msg       = buildMessage(team, season);

  // Initials for avatar
  const parts    = ownerName.split(' ');
  const initials = parts.map(p => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 overflow-y-auto p-4">
      {/* Ambient glow from team color */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] blur-[160px] opacity-20 pointer-events-none"
        style={{ background: team.primaryColor }}
      />

      <div className="relative w-full max-w-2xl my-auto animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Season badge */}
        <p className="text-center text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-8">
          {season}–{season + 1} Season · New GM Hire
        </p>

        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">

          {/* Colored header accent */}
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${team.primaryColor}, ${team.secondaryColor || team.primaryColor})` }} />

          <div className="p-8 sm:p-10 space-y-7">

            {/* Owner identity row */}
            <div className="flex items-center gap-5">
              {/* Avatar */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-display font-black shrink-0 shadow-lg border-2"
                style={{
                  background: `${team.primaryColor}30`,
                  borderColor: `${team.primaryColor}60`,
                  color: team.primaryColor,
                }}
              >
                {initials}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500 mb-0.5">
                  {team.city} {team.name} · Owner
                </p>
                <p className="text-2xl font-display font-bold text-white">{ownerName}</p>
                <span className={`inline-block mt-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800" />

            {/* Message */}
            <div className="space-y-4">
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">{msg.greeting}</p>
              {msg.body.map((para, i) => (
                <p key={i} className="text-slate-200 text-[15px] leading-relaxed">{para}</p>
              ))}
              <p
                className="text-base font-black italic mt-2"
                style={{ color: team.primaryColor }}
              >
                "{msg.closer}"
              </p>
            </div>

            {/* Expectations summary chips */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { label: `Goal: ${team.finances.ownerGoal}`,                     color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                { label: `Market: ${team.marketSize}`,                           color: 'bg-slate-800 text-slate-400 border-slate-700' },
                { label: `Owner Patience: ${team.finances.ownerPatience}/100`,   color: 'bg-slate-800 text-slate-400 border-slate-700' },
              ].map(chip => (
                <span key={chip.label} className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wide ${chip.color}`}>
                  {chip.label}
                </span>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={onContinue}
              className="w-full py-4 font-display font-black uppercase text-slate-950 rounded-2xl transition-all active:scale-[0.98] shadow-xl text-base"
              style={{
                background: `linear-gradient(135deg, ${team.primaryColor}, ${team.secondaryColor || team.primaryColor})`,
                boxShadow: `0 8px 32px ${team.primaryColor}40`,
              }}
            >
              Accept Position &amp; Begin →
            </button>

          </div>
        </div>

        <p className="text-center text-[10px] text-slate-700 mt-6 font-bold uppercase tracking-widest">
          {team.city} {team.name} · {season}–{season + 1}
        </p>
      </div>
    </div>
  );
};

export default OwnerWelcome;
