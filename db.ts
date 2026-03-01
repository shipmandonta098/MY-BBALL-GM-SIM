import Dexie, { type EntityTable } from 'dexie';
import { LeagueState } from './types';

const db = new Dexie('HoopsDynastyDB') as Dexie & {
  leagues: EntityTable<
    LeagueState,
    'id' // primary key "id" (for the whole object)
  >;
};

// Schema definition
// We index fields we might want to sort or filter by in the Title Screen
db.version(1).stores({
  leagues: 'id, lastUpdated, leagueName, season, currentDay'
});

export { db };