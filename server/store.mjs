import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHousehold, migrateHousehold } from '../shared/engine.mjs';

export function openStore(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS household_state (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, household_id TEXT NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL
    );`);
  const read = db.prepare('SELECT revision, snapshot FROM household_state WHERE id = ?');
  const write = db.prepare('INSERT INTO household_state VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, snapshot=excluded.snapshot');
  const event = db.prepare('INSERT OR IGNORE INTO audit_events VALUES (?, ?, ?, ?)');
  const id = 'demo-household';
  function load() {
    const row = read.get(id);
    return row ? JSON.parse(row.snapshot) : createHousehold();
  }
  function save(state, expectedRevision = undefined, resetJournal = false) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = read.get(id);
      if (expectedRevision !== undefined && current && current.revision !== expectedRevision) {
        throw Object.assign(new Error('The household changed. Refresh and review a new plan.'), { code: 'STALE_STATE' });
      }
      if (resetJournal) db.prepare('DELETE FROM audit_events WHERE household_id = ?').run(id);
      write.run(id, state.revision, JSON.stringify(state));
      for (const item of state.journal) event.run(item.id, id, state.revision, JSON.stringify(item));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return state;
  }
  if (!read.get(id)) save(createHousehold());
  else {
    const current = load();
    if (current.schemaVersion !== 2) save(migrateHousehold(current), current.revision);
  }
  return { load, save, reset: () => save(createHousehold(), undefined, true), close: () => db.close() };
}
