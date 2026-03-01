const fs = require('fs');

let c = fs.readFileSync('App.tsx', 'utf8');

const injection = `  const handleUpdateCoach = (updatedCoach: Coach) => {
    if (!league) return;

    const updateInTeams = league.teams.map(t => {
      const staff = t.staff;
      const isHere = Object.values(staff).some(c => c?.id === updatedCoach.id);
      if (!isHere) return t;
      
      const newStaff = { ...staff };
      if (newStaff.headCoach?.id === updatedCoach.id) newStaff.headCoach = updatedCoach;
      if (newStaff.assistantOffense?.id === updatedCoach.id) newStaff.assistantOffense = updatedCoach;
      if (newStaff.assistantDefense?.id === updatedCoach.id) newStaff.assistantDefense = updatedCoach;
      if (newStaff.assistantDev?.id === updatedCoach.id) newStaff.assistantDev = updatedCoach;
      if (newStaff.trainer?.id === updatedCoach.id) newStaff.trainer = updatedCoach;
      
      return { ...t, staff: newStaff };
    });

    const updateInCoachPool = league.coachPool.map(c => c.id === updatedCoach.id ? updatedCoach : c);

    setLeague({
      ...league,
      teams: updateInTeams,
      coachPool: updateInCoachPool
    });
    
    if (selectedCoach && selectedCoach.id === updatedCoach.id) {
      setSelectedCoach(updatedCoach);
    }
  };

  const handleViewPlayer = (player: Player | Prospect) => setSelectedPlayer(player as Player);`;

c = c.replace('  const handleViewPlayer = (player: Player | Prospect) => setSelectedPlayer(player as Player);', injection);

const oldModal = `{selectedCoach && (
         <CoachModal coach={selectedCoach} onClose={() => setSelectedCoach(null)} onScout={handleGenerateCoachIntelligence} scoutingReport={coachScoutingReport} isUserTeam={(Object.values(userTeam.staff) as (Coach | null)[]).some(s => s?.id === selectedCoach.id)} onFire={(id) => {`;

const newModal = `{selectedCoach && (
         <CoachModal 
            coach={selectedCoach} 
            onClose={() => setSelectedCoach(null)} 
            onScout={handleGenerateCoachIntelligence} 
            scoutingReport={coachScoutingReport} 
            isUserTeam={(Object.values(userTeam.staff) as (Coach | null)[]).some(s => s?.id === selectedCoach.id)} 
            godMode={league.settings.godMode}
            onUpdateCoach={handleUpdateCoach}
            onFire={(id) => {`;

c = c.replace(oldModal, newModal);
fs.writeFileSync('App.tsx', c);
console.log('App.tsx updated!');
