import { Team, Position, Player, Conference, Division, MarketSize, PersonalityTrait, ScheduleGame, Prospect, DraftPick, Coach, CoachScheme, CoachBadge, OwnerGoal, Gender, CoachRole, TeamRotation } from './types';

export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const SCHEMES: CoachScheme[] = ['Balanced', 'Pace and Space', 'Grit and Grind', 'Triangle', 'Small Ball', 'Showtime'];
export const COACH_ROLES: CoachRole[] = ['Head Coach', 'Assistant Offense', 'Assistant Defense', 'Assistant Dev', 'Trainer'];

export const PERSONALITY_TRAITS: PersonalityTrait[] = [
  'Leader', 'Diva/Star', 'Loyal', 'Professional', 'Gym Rat', 
  'Lazy', 'Clutch', 'Tough/Alpha', 'Friendly/Team First', 'Money Hungry'
];

export const getRandomTraits = (): PersonalityTrait[] => {
  const count = Math.floor(Math.random() * 3) + 1; // 1 to 3
  return [...PERSONALITY_TRAITS].sort(() => 0.5 - Math.random()).slice(0, count);
};

export const COACH_BADGES: CoachBadge[] = [
  'Developmental Genius', 'Pace Master', 'Star Handler', 'Defensive Guru', 
  'Offensive Architect', 'Clutch Specialist', 'Recruiting Ace'
];

const COLLEGES = ["Duke", "Kentucky", "Kansas", "UNC", "Gonzaga", "UCLA", "Villanova", "Arizona", "Michigan State", "UConn", "Purdue", "Houston", "Baylor", "Virginia", "Texas"];

const NAMES_MALE = {
  first: ["James", "Kevin", "Stephen", "Luka", "Joel", "Giannis", "Anthony", "Kawhi", "Kyrie", "Damian", "Jayson", "Devin", "Ja", "Zion", "Nikola", "Victor", "Chet", "Shai", "Tyrese", "Paolo", "Donovan", "Jalen", "Bam", "De'Aaron", "Cade"],
  last: ["James", "Durant", "Curry", "Doncic", "Embiid", "Antetokounmpo", "Davis", "Leonard", "Irving", "Lillard", "Tatum", "Booker", "Morant", "Williamson", "Jokic", "Wembanyama", "Holmgren", "Gilgeous", "Haliburton", "Banchero", "Mitchell", "Brunson", "Adebayo", "Fox", "Cunningham"]
};

const NAMES_FEMALE = {
  first: ["Maya", "Breanna", "Candace", "Diana", "A'ja", "Kelsey", "Jewell", "Elena", "Sabrina", "Brittney", "Jonquel", "Nneka", "Skylar", "Courtney", "Arike", "Caitlin", "Angel", "Aliyah", "Cameron", "Kamilla", "Juju", "Paige", "Rickea"],
  last: ["Moore", "Stewart", "Parker", "Taurasi", "Wilson", "Plum", "Loyd", "Delle Donne", "Ionescu", "Griner", "Jones", "Ogwumike", "Diggins-Smith", "Vandersloot", "Ogunbowale", "Clark", "Reese", "Boston", "Brink", "Cardoso", "Watkins", "Bueckers", "Jackson"]
};

const REGIONS = [
  {
    id: 'usa',
    name: 'United States',
    weight: 78,
    origins: ["Duke", "Kentucky", "Kansas", "UNC", "Gonzaga", "UCLA", "Villanova", "Arizona", "Michigan State", "UConn", "Purdue", "Houston", "Baylor", "Virginia", "Texas"],
    firstNamesMale: ["James", "Kevin", "Stephen", "Luka", "Joel", "Giannis", "Anthony", "Kawhi", "Kyrie", "Damian", "Jayson", "Devin", "Ja", "Zion", "Nikola", "Victor", "Chet", "Shai", "Tyrese", "Paolo", "Donovan", "Jalen", "Bam", "De'Aaron", "Cade"],
    lastNamesMale: ["James", "Durant", "Curry", "Doncic", "Embiid", "Antetokounmpo", "Davis", "Leonard", "Irving", "Lillard", "Tatum", "Booker", "Morant", "Williamson", "Jokic", "Wembanyama", "Holmgren", "Gilgeous", "Haliburton", "Banchero", "Mitchell", "Brunson", "Adebayo", "Fox", "Cunningham"],
    hometowns: ["New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Philadelphia, PA", "Phoenix, AZ", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "San Jose, CA"],
    flavor: { athleticism: 2, shooting: 0, passing: 0, iq: 0 }
  },
  {
    id: 'europe_balkans',
    name: 'Balkans',
    weight: 5,
    origins: ["Partizan Belgrade", "Crvena Zvezda", "Mega MIS", "Cedevita Olimpija", "Buducnost VOLI"],
    firstNamesMale: ["Nikola", "Luka", "Bogdan", "Vasilije", "Nemanja", "Milos", "Bojan", "Dario", "Ivica", "Jusuf", "Aleksej", "Filip", "Marko", "Stefan"],
    lastNamesMale: ["Jokic", "Doncic", "Bogdanovic", "Micic", "Bjelica", "Teodosic", "Saric", "Zubac", "Nurkic", "Pokuševski", "Petrušev", "Guduric", "Jovic", "Marjanovic"],
    hometowns: ["Belgrade, Serbia", "Ljubljana, Slovenia", "Zagreb, Croatia", "Podgorica, Montenegro"],
    flavor: { athleticism: -2, shooting: 2, passing: 3, iq: 3 }
  },
  {
    id: 'europe_west',
    name: 'Western Europe',
    weight: 5,
    origins: ["Real Madrid", "FC Barcelona", "ASVEL", "Monaco", "ALBA Berlin", "Bayern Munich", "Virtus Bologna", "Olimpia Milano"],
    firstNamesMale: ["Victor", "Rudy", "Evan", "Nicolas", "Killian", "Zaccharie", "Alexandre", "Moussa", "Theo", "Guerschon", "Dennis", "Franz", "Moritz", "Daniel", "Pau", "Marc", "Ricky", "Juancho", "Willy"],
    lastNamesMale: ["Wembanyama", "Gobert", "Fournier", "Batum", "Hayes", "Risacher", "Sarr", "Diabate", "Maledon", "Yabusele", "Schröder", "Wagner", "Theis", "Gasol", "Rubio", "Hernangomez"],
    hometowns: ["Paris, France", "Madrid, Spain", "Berlin, Germany", "Rome, Italy", "Barcelona, Spain"],
    flavor: { athleticism: 0, shooting: 2, passing: 2, iq: 2 }
  },
  {
    id: 'oceania',
    name: 'Oceania',
    weight: 3,
    origins: ["Melbourne United", "Sydney Kings", "Perth Wildcats", "New Zealand Breakers", "Tasmania JackJumpers"],
    firstNamesMale: ["Josh", "Patty", "Ben", "Joe", "Dante", "Matisse", "Duop", "Jock", "Dyson", "Jack", "Mitch", "Matthew"],
    lastNamesMale: ["Giddey", "Mills", "Simmons", "Ingles", "Exum", "Thybulle", "Reath", "Landale", "Daniels", "McVeigh", "Creek", "Dellavedova"],
    hometowns: ["Melbourne, Australia", "Sydney, Australia", "Perth, Australia", "Auckland, New Zealand"],
    flavor: { athleticism: 3, shooting: 1, passing: 1, iq: 0 }
  },
  {
    id: 'africa',
    name: 'Africa',
    weight: 3,
    origins: ["NBA Academy Africa", "AS Douanes", "Petro de Luanda", "Cape Town Tigers"],
    firstNamesMale: ["Joel", "Pascal", "Hakeem", "Dikembe", "Bismack", "Serge", "Precious", "Josh", "Udoka", "Charles", "Giannis"],
    lastNamesMale: ["Embiid", "Siakam", "Olajuwon", "Mutombo", "Biyombo", "Ibaka", "Achiuwa", "Okogie", "Bassey", "Antetokounmpo"],
    hometowns: ["Lagos, Nigeria", "Dakar, Senegal", "Yaoundé, Cameroon", "Johannesburg, South Africa"],
    flavor: { athleticism: 5, shooting: -2, passing: -2, iq: 0 }
  },
  {
    id: 'asia',
    name: 'Asia',
    weight: 2,
    origins: ["Chiba Jets", "Alvark Tokyo", "Guangdong Tigers", "Beijing Ducks", "Seoul SK Knights"],
    firstNamesMale: ["Yuta", "Rui", "Yuki", "Keisei", "Zhou", "Guo", "Kai", "Jordan", "Dwight", "Justin"],
    lastNamesMale: ["Watanabe", "Hachimura", "Kawamura", "Tominaga", "Qi", "Ailun", "Sotto", "Clarkson", "Ramos", "Brown"],
    hometowns: ["Tokyo, Japan", "Beijing, China", "Manila, Philippines", "Seoul, South Korea"],
    flavor: { athleticism: -1, shooting: 3, passing: 1, iq: 1 }
  },
  {
    id: 'latin_america',
    name: 'Latin America',
    weight: 2,
    origins: ["Flamengo", "Sesi Franca", "Quimsa", "San Lorenzo", "Capitanes de Ciudad de México"],
    firstNamesMale: ["Gui", "Raul", "Leandro", "Anderson", "Nene", "Facundo", "Manu", "Luis", "Gabriel", "Jaime"],
    lastNamesMale: ["Santos", "Neto", "Barbosa", "Varejao", "Hilario", "Campazzo", "Ginobili", "Scola", "Deck", "Jaquez"],
    hometowns: ["São Paulo, Brazil", "Buenos Aires, Argentina", "Mexico City, Mexico", "Rio de Janeiro, Brazil"],
    flavor: { athleticism: 1, shooting: 1, passing: 2, iq: 2 }
  },
  {
    id: 'canada',
    name: 'Canada',
    weight: 2,
    origins: ["Orangeville Prep", "Scarborough Shooting Stars", "Montreal Alliance", "Carleton University"],
    firstNamesMale: ["Shai", "Jamal", "RJ", "Andrew", "Dillon", "Luguentz", "Bennedict", "Shaedon", "Kelly", "Dwight"],
    lastNamesMale: ["Gilgeous-Alexander", "Murray", "Barrett", "Wiggins", "Brooks", "Dort", "Mathurin", "Sharpe", "Olynyk", "Powell"],
    hometowns: ["Toronto, Canada", "Montreal, Canada", "Vancouver, Canada", "Ottawa, Canada"],
    flavor: { athleticism: 2, shooting: 2, passing: 1, iq: 1 }
  }
];

const COACH_FIRST_NAMES_MALE = ["Gregg", "Erik", "Steve", "Phil", "Doc", "Nick", "Ime", "Joe", "Monty", "Jason", "Tyronn", "Mike", "Rick", "Darko", "Billy"];
const COACH_FIRST_NAMES_FEMALE = ["Becky", "Dawn", "Cheryl", "Teresa", "Sandy", "Kara", "Noelle", "Tanisha", "Stephanie", "Latricia", "Nell", "Pat", "Geno", "Kim", "Holly"];

export const TEAM_DATA = [
  { city: "New York", name: "Titans", conf: "Eastern", div: "Atlantic", market: "Large", primary: "#F58426", secondary: "#006BB6" },
  { city: "Boston", name: "Founders", conf: "Eastern", div: "Atlantic", market: "Medium", primary: "#007A33", secondary: "#BA9653" },
  { city: "Toronto", name: "Tundra", conf: "Eastern", div: "Atlantic", market: "Large", primary: "#CE1141", secondary: "#000000" },
  { city: "Brooklyn", name: "Bridges", conf: "Eastern", div: "Atlantic", market: "Large", primary: "#000000", secondary: "#FFFFFF" },
  { city: "Philadelphia", name: "Liberty", conf: "Eastern", div: "Atlantic", market: "Medium", primary: "#006BB6", secondary: "#ED174C" },
  { city: "Chicago", name: "Cyclones", conf: "Eastern", div: "Central", market: "Large", primary: "#C8102E", secondary: "#000000" },
  { city: "Milwaukee", name: "Millers", conf: "Eastern", div: "Central", market: "Small", primary: "#00471B", secondary: "#EEE1C6" },
  { city: "Cleveland", name: "Iron", conf: "Eastern", div: "Central", market: "Small", primary: "#860038", secondary: "#FDBB30" },
  { city: "Indiana", name: "Arrows", conf: "Eastern", div: "Central", market: "Small", primary: "#002D62", secondary: "#FDBB30" },
  { city: "Detroit", name: "Dynamos", conf: "Eastern", div: "Central", market: "Medium", primary: "#C8102E", secondary: "#1D42BA" },
  { city: "Miami", name: "Sharks", conf: "Eastern", div: "Southeast", market: "Medium", primary: "#98002E", secondary: "#F9A01B" },
  { city: "Atlanta", name: "Phoenix", conf: "Eastern", div: "Southeast", market: "Medium", primary: "#E03A3E", secondary: "#C1D32F" },
  { city: "Orlando", name: "Oracles", conf: "Eastern", div: "Southeast", market: "Small", primary: "#0077C0", secondary: "#C4CED4" },
  { city: "Washington", name: "Sentinels", conf: "Eastern", div: "Southeast", market: "Medium", primary: "#002B5C", secondary: "#E31837" },
  { city: "Charlotte", name: "Monarchs", conf: "Eastern", div: "Southeast", market: "Small", primary: "#1D1160", secondary: "#00788C" },
  { city: "Denver", name: "Peaks", conf: "Western", div: "Northwest", market: "Small", primary: "#0E2240", secondary: "#FEC524" },
  { city: "Minnesota", name: "Frost", conf: "Western", div: "Northwest", market: "Small", primary: "#0C2340", secondary: "#236192" },
  { city: "Oklahoma City", name: "Bison", conf: "Western", div: "Northwest", market: "Small", primary: "#007AC1", secondary: "#EF3B24" },
  { city: "Portland", name: "Pioneers", conf: "Western", div: "Northwest", market: "Small", primary: "#E03A3E", secondary: "#000000" },
  { city: "Utah", name: "Summit", conf: "Western", div: "Northwest", market: "Small", primary: "#002B5C", secondary: "#F9A01B" },
  { city: "Golden State", name: "Surge", conf: "Western", div: "Pacific", market: "Large", primary: "#1D428A", secondary: "#FFC72C" },
  { city: "Los Angeles", name: "Lights", conf: "Western", div: "Pacific", market: "Large", primary: "#552583", secondary: "#FDB927" },
  { city: "Phoenix", name: "Scorpions", conf: "Western", div: "Pacific", market: "Medium", primary: "#1D1160", secondary: "#E56020" },
  { city: "Sacramento", name: "Gold", conf: "Western", div: "Pacific", market: "Small", primary: "#5A2D81", secondary: "#63727A" },
  { city: "Las Vegas", name: "Aces", conf: "Western", div: "Pacific", market: "Medium", primary: "#C8102E", secondary: "#000000" },
  { city: "Dallas", name: "Wranglers", conf: "Western", div: "Southwest", market: "Medium", primary: "#00538C", secondary: "#002B5E" },
  { city: "Houston", name: "Orbit", conf: "Western", div: "Southwest", market: "Large", primary: "#CE1141", secondary: "#000000" },
  { city: "Memphis", name: "Pharaohs", conf: "Western", div: "Southwest", market: "Small", primary: "#5D76A9", secondary: "#12173F" },
  { city: "New Orleans", name: "Voodoo", conf: "Western", div: "Southwest", market: "Small", primary: "#0C2340", secondary: "#C8102E" },
  { city: "San Antonio", name: "Missions", conf: "Western", div: "Southwest", market: "Small", primary: "#000000", secondary: "#C4CED4" },
];

export const EXPANSION_TEAM_POOL = [
  { city: "Seattle", name: "Storm", conf: "Western", div: "Northwest", market: "Large", primary: "#00471B", secondary: "#FEE123" },
  { city: "Las Vegas", name: "Royals", conf: "Western", div: "Pacific", market: "Medium", primary: "#702963", secondary: "#FFD700" },
  { city: "Vancouver", name: "Orcas", conf: "Western", div: "Pacific", market: "Medium", primary: "#041E42", secondary: "#00843D" },
  { city: "Mexico City", name: "Aztecs", conf: "Western", div: "Southwest", market: "Large", primary: "#006341", secondary: "#CE1126" },
  { city: "St. Louis", name: "Arch", conf: "Eastern", div: "Central", market: "Medium", primary: "#002F6C", secondary: "#BA0C2F" },
  { city: "San Diego", name: "Sails", conf: "Western", div: "Pacific", market: "Medium", primary: "#002D62", secondary: "#FEC524" },
];

export const getRandomGender = (ratio: number): Gender => {
  return Math.random() * 100 < ratio ? 'Female' : 'Male';
};

export const generateCoach = (id: string, tier: 'A' | 'B' | 'C' | 'D' = 'C', genderRatio: number = 0): Coach => {
  const gender = getRandomGender(genderRatio);
  const firstNames = gender === 'Male' ? COACH_FIRST_NAMES_MALE : COACH_FIRST_NAMES_FEMALE;
  const lastNames = gender === 'Male' ? NAMES_MALE.last : NAMES_FEMALE.last;
  const cities = ["San Antonio, TX", "Miami, FL", "Oakland, CA", "Chicago, IL", "Philadelphia, PA", "Seattle, WA"];
  
  const baseRating = tier === 'A' ? 88 : tier === 'B' ? 80 : tier === 'C' ? 70 : 60;
  const getRandom = (base: number) => Math.min(99, Math.max(40, base + Math.floor(Math.random() * 15 - 5)));

  const experience = tier === 'A' ? 15 + Math.floor(Math.random() * 15) : tier === 'B' ? 8 + Math.floor(Math.random() * 10) : tier === 'C' ? 3 + Math.floor(Math.random() * 8) : 1;
  const badgesCount = tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'C' ? 1 : 0;
  const badges = [...COACH_BADGES].sort(() => 0.5 - Math.random()).slice(0, badgesCount);

  const salary = tier === 'A' ? 8000000 : tier === 'B' ? 5000000 : tier === 'C' ? 2000000 : 800000;

  return {
    id,
    name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
    age: 35 + Math.floor(Math.random() * 40),
    gender,
    role: COACH_ROLES[Math.floor(Math.random() * COACH_ROLES.length)],
    hometown: cities[Math.floor(Math.random() * cities.length)],
    college: COLLEGES[Math.floor(Math.random() * COLLEGES.length)],
    experience,
    history: `Served as ${tier === 'A' ? 'lead architect' : 'assistant'} for several championship runs. Known for ${tier === 'A' ? 'elite playcalling' : 'locker room stability'}.`,
    ratingOffense: getRandom(baseRating),
    ratingDefense: getRandom(baseRating),
    ratingDevelopment: getRandom(baseRating),
    ratingMotivation: getRandom(baseRating),
    ratingClutch: getRandom(baseRating),
    ratingRecruiting: getRandom(baseRating),
    potential: Math.min(99, baseRating + Math.floor(Math.random() * 10)),
    scheme: SCHEMES[Math.floor(Math.random() * SCHEMES.length)],
    badges,
    specialization: ['None', 'Shooting', 'Defense', 'Big Men', 'Conditioning'][Math.floor(Math.random() * 5)] as any,
    salary,
    contractYears: Math.floor(Math.random() * 4) + 1,
    desiredContract: {
      years: Math.floor(Math.random() * 3) + 1,
      salary: Math.floor(salary * (0.8 + Math.random() * 0.4))
    },
    interestScore: 30 + Math.floor(Math.random() * 60)
  };
};

export const generateCoachPool = (count: number, genderRatio: number = 10): Coach[] => {
  return Array.from({ length: count }).map((_, i) => {
    const tier = i < 5 ? 'A' : i < 15 ? 'B' : i < 35 ? 'C' : 'D';
    return generateCoach(`coach-fa-${i}`, tier, genderRatio);
  });
};

export const generatePlayer = (id: string, ageRange: [number, number] = [19, 38], genderRatio: number = 0): Player => {
  const gender = getRandomGender(genderRatio);
  
  // Pick a region based on weights
  const randRegion = Math.random() * 100;
  let cumulative = 0;
  let region = REGIONS[0];
  for (const r of REGIONS) {
    cumulative += r.weight;
    if (randRegion <= cumulative) {
      region = r;
      break;
    }
  }

  const firstNames = gender === 'Male' ? region.firstNamesMale : NAMES_FEMALE.first;
  const lastNames = gender === 'Male' ? region.lastNamesMale : NAMES_FEMALE.last;
  
  const rand = Math.random();
  let baseRating = rand > 0.96 ? 88 + Math.floor(Math.random() * 10) : rand > 0.85 ? 80 + Math.floor(Math.random() * 10) : rand > 0.5 ? 70 + Math.floor(Math.random() * 15) : 60 + Math.floor(Math.random() * 10);
  const rating = Math.min(99, Math.max(60, baseRating));
  const potential = Math.min(99, rating + Math.floor(Math.random() * 12));
  const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
  const age = Math.floor(Math.random() * (ageRange[1] - ageRange[0]) + ageRange[0]);
  
  const f = region.flavor;
  const getRandomAttr = (base: number, flavor: number = 0) => 
    Math.min(99, Math.max(25, Math.floor(base + flavor + (Math.random() * 20 - 10))));
  
  return {
    id,
    name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
    gender,
    age,
    position: pos,
    rating,
    potential,
    attributes: {
      shooting: rating + f.shooting, 
      defense: rating, 
      rebounding: rating, 
      playmaking: rating + f.passing, 
      athleticism: rating + f.athleticism,
      shootingInside: getRandomAttr(rating), 
      shootingMid: getRandomAttr(rating, f.shooting), 
      shooting3pt: getRandomAttr(rating, f.shooting), 
      freeThrow: getRandomAttr(rating, f.shooting),
      speed: getRandomAttr(rating, f.athleticism), 
      strength: getRandomAttr(rating, f.athleticism), 
      jumping: getRandomAttr(rating, f.athleticism), 
      stamina: getRandomAttr(rating),
      perimeterDef: getRandomAttr(rating), 
      interiorDef: getRandomAttr(rating), 
      steals: getRandomAttr(rating), 
      blocks: getRandomAttr(rating), 
      defensiveIQ: getRandomAttr(rating, f.iq),
      ballHandling: getRandomAttr(rating, f.passing), 
      passing: getRandomAttr(rating, f.passing), 
      offensiveIQ: getRandomAttr(rating, f.iq), 
      postScoring: getRandomAttr(rating), 
      offReb: getRandomAttr(rating), 
      defReb: getRandomAttr(rating),
    },
    salary: Math.floor((rating / 100) * 45000000),
    contractYears: Math.floor(Math.random() * 5) + 1,
    stats: { 
      points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, gamesPlayed: 0, gamesStarted: 0,
      minutes: 0, fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0, tov: 0, pf: 0,
      techs: 0, flagrants: 0, ejections: 0, plusMinus: 0
    },
    careerStats: [],
    gameLog: [],
    careerHighs: {
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      threepm: 0
    },
    morale: 75 + Math.floor(Math.random() * 20),
    jerseyNumber: Math.floor(Math.random() * 99),
    height: "6'7\"", weight: 220, status: 'Bench',
    personalityTraits: getRandomTraits(),
    hometown: region.hometowns[Math.floor(Math.random() * region.hometowns.length)], 
    birthdate: "1995-01-01", 
    college: region.id === 'usa' ? COLLEGES[Math.floor(Math.random() * COLLEGES.length)] : region.name,
    draftInfo: { team: "Titans", round: 1, pick: 1, year: 2015 }
  };
};

export const generateFreeAgentPool = (count: number, season: number, genderRatio: number = 0): Player[] => {
  return Array.from({ length: count }).map((_, i) => {
    const p = generatePlayer(`fa-${season}-${i}`, [21, 36], genderRatio);
    return {
      ...p,
      isFreeAgent: true,
      lastTeamId: undefined,
      contractYears: 0,
      desiredContract: {
        years: Math.floor(Math.random() * 3) + 1,
        salary: Math.floor(p.rating * 150000 + Math.random() * 2000000)
      },
      interestScore: 30 + Math.floor(Math.random() * 50)
    };
  });
};

export const generateProspects = (year: number, count: number = 100, genderRatio: number = 0): Prospect[] => {
  return Array.from({ length: count }).map((_, i) => {
    const gender = getRandomGender(genderRatio);
    
    // Pick a region based on weights
    const randRegion = Math.random() * 100;
    let cumulative = 0;
    let region = REGIONS[0];
    for (const r of REGIONS) {
      cumulative += r.weight;
      if (randRegion <= cumulative) {
        region = r;
        break;
      }
    }

    const firstNames = gender === 'Male' ? region.firstNamesMale : NAMES_FEMALE.first;
    const lastNames = gender === 'Male' ? region.lastNamesMale : NAMES_FEMALE.last;
    
    const id = `prospect-${year}-${i}`;
    const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
    
    let rating = 60 + Math.floor(Math.random() * 15);
    if (i < 5) rating = 78 + Math.floor(Math.random() * 5); 
    else if (i < 15) rating = 72 + Math.floor(Math.random() * 6); 
    
    const potential = Math.min(99, rating + Math.floor(Math.random() * 20) + 5);
    
    // Apply regional flavor
    const f = region.flavor;
    const getRandomAttr = (base: number, flavor: number = 0) => 
      Math.min(99, Math.max(25, Math.floor(base + flavor + (Math.random() * 25 - 12))));

    return {
      id,
      name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      gender,
      age: 19 + Math.floor(Math.random() * 3),
      position: pos,
      rating,
      potential,
      scoutGrade: i < 5 ? 5 : i < 15 ? 4 : i < 40 ? 3 : 2,
      school: region.origins[Math.floor(Math.random() * region.origins.length)],
      revealed: false,
      mockRank: i + 1,
      attributes: {
        shooting: rating + f.shooting, 
        defense: rating, 
        rebounding: rating, 
        playmaking: rating + f.passing, 
        athleticism: rating + f.athleticism,
        shootingInside: getRandomAttr(rating), 
        shootingMid: getRandomAttr(rating, f.shooting), 
        shooting3pt: getRandomAttr(rating, f.shooting), 
        freeThrow: getRandomAttr(rating, f.shooting),
        speed: getRandomAttr(rating, f.athleticism), 
        strength: getRandomAttr(rating, f.athleticism), 
        jumping: getRandomAttr(rating, f.athleticism), 
        stamina: getRandomAttr(rating),
        perimeterDef: getRandomAttr(rating), 
        interiorDef: getRandomAttr(rating), 
        steals: getRandomAttr(rating), 
        blocks: getRandomAttr(rating), 
        defensiveIQ: getRandomAttr(rating, f.iq),
        ballHandling: getRandomAttr(rating, f.passing), 
        passing: getRandomAttr(rating, f.passing), 
        offensiveIQ: getRandomAttr(rating, f.iq), 
        postScoring: getRandomAttr(rating), 
        offReb: getRandomAttr(rating), 
        defReb: getRandomAttr(rating),
      },
      jerseyNumber: Math.floor(Math.random() * 99),
      height: "6'8\"", weight: 210,
      personalityTraits: getRandomTraits(),
      hometown: region.hometowns[Math.floor(Math.random() * region.hometowns.length)], 
      birthdate: `${year - 19}-01-01`, 
      college: region.id === 'usa' ? "N/A" : region.name,
      draftInfo: { team: "N/A", round: 0, pick: 0, year },
      careerStats: [],
      gameLog: [],
      careerHighs: {
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        threepm: 0
      }
    };
  });
};

export const generateDefaultRotation = (roster: Player[]): TeamRotation => {
  const sorted = [...roster].sort((a, b) => b.rating - a.rating);
  const starters: Record<Position, string> = {
    PG: '', SG: '', SF: '', PF: '', C: ''
  };
  
  const assignedIds = new Set<string>();
  
  // Try to fill positions naturally
  const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  positions.forEach(pos => {
    const bestAtPos = sorted.find(p => p.position === pos && !assignedIds.has(p.id));
    if (bestAtPos) {
      starters[pos] = bestAtPos.id;
      assignedIds.add(bestAtPos.id);
    }
  });
  
  // Fill remaining starter spots with best available
  positions.forEach(pos => {
    if (!starters[pos]) {
      const bestAvailable = sorted.find(p => !assignedIds.has(p.id));
      if (bestAvailable) {
        starters[pos] = bestAvailable.id;
        assignedIds.add(bestAvailable.id);
      }
    }
  });
  
  const bench: string[] = [];
  const reserves: string[] = [];
  
  sorted.forEach(p => {
    if (!assignedIds.has(p.id)) {
      if (bench.length < 5) {
        bench.push(p.id);
      } else {
        reserves.push(p.id);
      }
    }
  });
  
  const minutes: Record<string, number> = {};
  // Starters get ~34 mins
  Object.values(starters).forEach(id => {
    minutes[id] = 34;
  });
  // Bench gets ~14 mins
  bench.forEach(id => {
    minutes[id] = 14;
  });
  // Reserves get 0
  reserves.forEach(id => {
    minutes[id] = 0;
  });
  
  return { starters, bench, reserves, minutes };
};

export const generateLeagueTeams = (genderRatio: number = 0): Team[] => {
  return TEAM_DATA.map((data, i) => {
    const teamId = `team-${i}`;
    const picks: DraftPick[] = [
      { round: 1, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
      { round: 2, pick: 0, originalTeamId: teamId, currentTeamId: teamId }
    ];

    const ownerGoals: OwnerGoal[] = ['Win Now', 'Rebuild', 'Profit'];
    const roster = Array.from({ length: 14 }).map((_, j) => generatePlayer(`p-${i}-${j}`, [19, 38], genderRatio));

    return {
      id: teamId,
      name: data.name,
      city: data.city,
      roster,
      staff: {
        headCoach: generateCoach(`coach-${teamId}-hc`, 'B', genderRatio),
        assistantOffense: generateCoach(`coach-${teamId}-off`, 'C', genderRatio),
        assistantDefense: generateCoach(`coach-${teamId}-def`, 'C', genderRatio),
        assistantDev: generateCoach(`coach-${teamId}-dev`, 'C', genderRatio),
        trainer: generateCoach(`coach-${teamId}-tr`, 'C', genderRatio)
      },
      staffBudget: 15000000,
      activeScheme: 'Balanced',
      wins: 0, losses: 0, homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0, confWins: 0, confLosses: 0, lastTen: [],
      budget: 180000000,
      logo: `https://picsum.photos/seed/${data.city.replace(/\s/g, '')}${data.name}/400`,
      conference: data.conf as Conference,
      division: data.div as Division,
      marketSize: data.market as MarketSize,
      streak: 0,
      picks,
      finances: {
        revenue: 5000000,
        expenses: 4000000,
        cash: 25000000,
        ticketPrice: 85,
        concessionPrice: 12,
        fanHype: 65,
        ownerPatience: 80,
        ownerGoal: ownerGoals[Math.floor(Math.random() * ownerGoals.length)],
        budgets: {
          coaching: 70,
          scouting: 70,
          health: 70,
          facilities: 70
        }
      },
      primaryColor: data.primary,
      secondaryColor: data.secondary,
      rotation: generateDefaultRotation(roster),
      abbreviation: data.city.substring(0, 3).toUpperCase(),
      population: data.market === 'Large' ? 8.5 : data.market === 'Medium' ? 4.2 : 1.5,
      stadiumCapacity: data.market === 'Large' ? 20000 : data.market === 'Medium' ? 18500 : 17000,
      borderStyle: 'Solid',
      status: 'Active',
    };
  });
};

export const generateSeasonSchedule = (teams: Team[], numGames: number = 82): ScheduleGame[] => {
  const schedule: ScheduleGame[] = [];
  const teamGamesCountTotal: Record<string, number> = {};
  const teamGamesScheduled: Record<string, number> = {};
  const teamLastDay: Record<string, number> = {};
  const teamB2BCount: Record<string, number> = {};
  const teamLastB2BGameIndex: Record<string, number> = {}; 

  teams.forEach(t => {
    teamGamesCountTotal[t.id] = 0;
    teamGamesScheduled[t.id] = 0;
    teamLastDay[t.id] = -5;
    teamB2BCount[t.id] = 0;
    teamLastB2BGameIndex[t.id] = -10;
  });

  const matchupsPool: { t1: string, t2: string }[] = [];
  const pairings: Record<string, Record<string, number>> = {};
  teams.forEach(t => pairings[t.id] = {});

  const addGameToPool = (id1: string, id2: string) => {
    matchupsPool.push({ t1: id1, t2: id2 });
    teamGamesCountTotal[id1]++;
    teamGamesCountTotal[id2]++;
    pairings[id1][id2] = (pairings[id1][id2] || 0) + 1;
    pairings[id2][id1] = (pairings[id2][id1] || 0) + 1;
  };

  // Build the pool to have EXACTLY numGames per team
  // Proximity-based filling
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i];
      const t2 = teams[j];
      let count = 0;
      if (numGames >= 80) {
        if (t1.division === t2.division) count = 4;
        else if (t1.conference === t2.conference) count = 3;
        else count = 2;
      } else {
        count = 1;
      }
      for (let c = 0; c < count; c++) {
        if (teamGamesCountTotal[t1.id] < numGames && teamGamesCountTotal[t2.id] < numGames) {
          addGameToPool(t1.id, t2.id);
        }
      }
    }
  }

  // Fill remainders greedy
  const allTeamIds = teams.map(t => t.id);
  allTeamIds.forEach(id => {
    while (teamGamesCountTotal[id] < numGames) {
      const bestOpponent = allTeamIds
        .filter(oid => oid !== id && teamGamesCountTotal[oid] < numGames)
        .sort((a, b) => (pairings[id][a] || 0) - (pairings[id][b] || 0))[0];
      if (bestOpponent) addGameToPool(id, bestOpponent);
      else break;
    }
  });

  matchupsPool.sort(() => Math.random() - 0.5);

  let currentLeagueDay = 1;
  while (matchupsPool.length > 0 && currentLeagueDay < 500) {
    const playedToday = new Set<string>();
    for (let i = 0; i < matchupsPool.length; i++) {
      const { t1, t2 } = matchupsPool[i];
      if (playedToday.has(t1) || playedToday.has(t2)) continue;

      const t1Last = teamLastDay[t1];
      const t2Last = teamLastDay[t2];
      const t1B2B = t1Last === currentLeagueDay - 1;
      const t2B2B = t2Last === currentLeagueDay - 1;

      if (t1B2B && (teamB2BCount[t1] >= 20 || teamGamesScheduled[t1] - teamLastB2BGameIndex[t1] < 3)) continue;
      if (t2B2B && (teamB2BCount[t2] >= 20 || teamGamesScheduled[t2] - teamLastB2BGameIndex[t2] < 3)) continue;

      const roll = Math.random();
      const restT1 = t1B2B ? 1 : (roll < 0.3 ? 1 : 2);
      const restT2 = t2B2B ? 1 : (roll < 0.3 ? 1 : 2);

      if (currentLeagueDay - t1Last < restT1 && !t1B2B) continue;
      if (currentLeagueDay - t2Last < restT2 && !t2B2B) continue;

      const isHome = Math.random() > 0.5;
      if (t1B2B) { teamB2BCount[t1]++; teamLastB2BGameIndex[t1] = teamGamesScheduled[t1]; }
      if (t2B2B) { teamB2BCount[t2]++; teamLastB2BGameIndex[t2] = teamGamesScheduled[t2]; }

      schedule.push({
        id: `game-${currentLeagueDay}-${t1}-${t2}`,
        day: currentLeagueDay,
        homeTeamId: isHome ? t1 : t2,
        awayTeamId: isHome ? t2 : t1,
        played: false,
        homeB2B: isHome ? t1B2B : t2B2B,
        awayB2B: isHome ? t2B2B : t1B2B,
        homeB2BCount: isHome ? teamB2BCount[t1] : teamB2BCount[t2],
        awayB2BCount: isHome ? teamB2BCount[t2] : teamB2BCount[t1]
      });

      teamLastDay[t1] = currentLeagueDay; teamLastDay[t2] = currentLeagueDay;
      teamGamesScheduled[t1]++; teamGamesScheduled[t2]++;
      playedToday.add(t1); playedToday.add(t2);
      matchupsPool.splice(i, 1);
      i--;
      if (playedToday.size >= 30) break;
    }
    currentLeagueDay++;
  }

  teams.forEach(team => {
    let counter = 1;
    schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id)
      .sort((a, b) => a.day - b.day)
      .forEach(g => { g.gameNumber = counter++; });
  });

  return schedule.sort((a, b) => a.day - b.day);
};

export const dayToDateString = (day: number, seasonYear: number) => `Day ${day}`;
