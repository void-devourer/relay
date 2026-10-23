import test from 'node:test';
import assert from 'node:assert/strict';
import { createHousehold, applyDisruption, buildPlans, setConstraint, respond, executePlan, importCalendar, migrateHousehold } from '../shared/engine.mjs';
import { previewCalendar } from '../shared/calendar.mjs';
const event = (start = '150000', end = '160000', extra = '') => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:20261015T${start}\nDTEND:20261015T${end}\nSUMMARY:Client call\n${extra}END:VEVENT\nEND:VCALENDAR`;

test('compound requests preserve all exact facts and enforce a hard meeting lock', () => {
  const { state, trace } = respond(createHousehold(), "Alex is delayed by 45 minutes. School closes at 3:10. Don't move my client call, and keep spending under $10.");
  assert.equal(state.members.find(p => p.id === 'alex').availableFrom, 980);
  assert.equal(state.tasks.find(t => t.id === 'pickup').start, 910);
  assert.equal(state.tasks.find(t => t.id === 'meeting').flexible, false);
  assert.equal(state.preferences.maxExtraCost, 9.99);
  assert.equal(state.disruptions.length, 2);
  assert.equal(state.plans.find(p => p.variant === 'family').feasible, false);
  assert.equal(state.plans.find(p => p.variant === 'backup').feasible, true);
  assert.ok(trace.some(item => item.tool === 'set_constraint'));
  const result = respond(state, 'Morgan is unavailable');
  assert.equal(result.state.tasks.find(t => t.id === 'pickup').start, 910);
  assert.equal(result.state.members.find(p => p.id === 'alex').availableFrom, 980);
  assert.equal(result.state.tasks.find(t => t.id === 'meeting').flexible, false);
  assert.equal(result.state.plans.filter(p => p.feasible).length, 0);
  assert.match(result.reply, /No recovery/);
});

test('a second disruption keeps applied assignments and imported commitments', () => {
  let state = buildPlans(applyDisruption(createHousehold(), 'partner-delayed'));
  state = executePlan(state, state.activePlanId, { confirmed: true });
  const shiftedMeeting = state.tasks.find(t => t.id === 'meeting').start;
  state = applyDisruption(state, 'school-early', { pickupTime: 900 });
  assert.equal(state.tasks.find(t => t.id === 'meeting').start, shiftedMeeting);
  assert.equal(state.tasks.find(t => t.id === 'pickup').owner, 'priya');
  assert.equal(state.members.find(p => p.id === 'alex').availableFrom, 1035);
});

test('persistent failures compensate tasks, invalidate old approval and check a different workflow', () => {
  const initial = buildPlans(applyDisruption(createHousehold(), 'partner-delayed'));
  const id = initial.activePlanId;
  const failed = executePlan(initial, id, { confirmed: true, failAt: 1, adaptive: true });
  assert.deepEqual(failed.tasks, initial.tasks);
  assert.equal(failed.phase, 'rolled_back');
  assert.ok(failed.blockedVariants.includes('family'));
  assert.notEqual(failed.activePlanId, id);
  assert.equal(failed.plans.find(p => p.id === failed.activePlanId).variant, 'backup');
  assert.throws(() => executePlan(failed, id, { confirmed: true }), /no longer available/);
  assert.equal(executePlan(failed, failed.activePlanId, { confirmed: true }).tasks.find(t => t.id === 'pickup').owner, 'morgan');
});

test('calendar preview is read-only; import changes actual feasibility and survives later facts', () => {
  const original = createHousehold();
  const preview = previewCalendar(event(), 'priya');
  assert.equal(preview.events.length, 1);
  assert.equal(original.importedCalendar.length, 0);
  const imported = importCalendar(original, { text: event(), ownerId: 'priya' });
  assert.equal(imported.tasks.find(t => t.id === 'meeting').flexible, false);
  assert.equal(imported.importedCalendar[0].count, 1);
  const state = buildPlans(applyDisruption(imported, 'school-early'));
  assert.equal(state.tasks.find(t => t.id === 'meeting').title, 'Client call');
  assert.equal(state.plans.find(p => p.variant === 'family').feasible, false);
  assert.equal(state.plans.find(p => p.variant === 'backup').feasible, true);
});

test('calendar rejects recurrence, all-day events, bad times and unsupported zones without mutation', () => {
  const original = createHousehold(), before = structuredClone(original);
  for (const text of [event('150000', '160000', 'RRULE:FREQ=DAILY\n'), event('256000'), event().replace('DTSTART:', 'DTSTART;VALUE=DATE:'), event().replace('DTSTART:', 'DTSTART;TZID=Europe/London:')]) {
    assert.throws(() => importCalendar(original, { text, ownerId: 'priya' }));
    assert.deepEqual(original, before);
  }
  assert.throws(() => previewCalendar(event(), 'morgan'), /owner/);
  assert.equal(previewCalendar(event('093000Z', '103000Z')).events[0].start, 900);
});

test('old saved state migrates without dropping tasks, preferences or conversation', () => {
  const legacy = createHousehold(); delete legacy.schemaVersion;
  const state = migrateHousehold(legacy);
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.tasks, legacy.tasks);
  assert.deepEqual(state.preferences, legacy.preferences);
  assert.equal(state.revision, legacy.revision + 1);
});

test('invalid timing and a negated delay never change household facts', () => {
  const seed = createHousehold();
  assert.throws(() => applyDisruption(seed, 'partner-delayed', { delayMinutes: -1 }));
  assert.throws(() => applyDisruption(seed, 'school-early', { pickupTime: 300 }));
  assert.throws(() => setConstraint(seed, { kind: 'meeting-lock', value: 'yes' }));
  assert.deepEqual(respond(seed, 'Alex is not delayed').state.tasks, seed.tasks);
  assert.equal(respond(seed, 'Alex is not delayed').state.disruptions.length, 0);
});
