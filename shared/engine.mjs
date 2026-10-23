/** Relay's deterministic sandbox domain. No network, model, or external writes. */
import { previewCalendar } from './calendar.mjs';
const SCENARIOS = ['partner-delayed', 'school-early', 'car-unavailable', 'backup-unavailable'];
const FIELDS = ['owner', 'start', 'end', 'status'];
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };
const task = (state, id) => state.tasks.find((item) => item.id === id);
const member = (state, id) => state.members.find((item) => item.id === id);

export function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function createHousehold() {
  return {
    id: 'relay-demo-household', schemaVersion: 2, revision: 0, scenario: null, phase: 'steady', disruptions: [], blockedVariants: [], importedCalendar: [], lastFailure: null,
    members: [
      { id: 'alex', name: 'Alex', role: 'Parent', initials: 'AL', color: '#f0ae72', availableFrom: 935, availableUntil: 1260, travelMinutes: 15, authorizedPickup: true, availabilityConfirmed: true },
      { id: 'priya', name: 'Priya', role: 'Parent', initials: 'PR', color: '#b0a2e3', availableFrom: 840, availableUntil: 1260, travelMinutes: 15, authorizedPickup: true, availabilityConfirmed: true },
      { id: 'morgan', name: 'Morgan', role: 'Trusted backup', initials: 'MO', color: '#80c6b3', availableFrom: 900, availableUntil: 1080, travelMinutes: 10, authorizedPickup: true, availabilityConfirmed: true },
    ],
    tasks: [
      { id: 'meeting', title: 'Client catch-up', owner: 'priya', start: 900, end: 960, location: 'Home', kind: 'work', status: 'scheduled', flexible: true },
      { id: 'pickup', title: 'Pick up Sam', owner: 'alex', start: 960, end: 970, location: 'School', kind: 'pickup', status: 'scheduled', flexible: false },
      { id: 'grocery', title: 'Collect groceries', owner: 'alex', start: 985, end: 1015, location: 'Market', kind: 'grocery', status: 'scheduled', flexible: true },
      { id: 'dinner', title: 'Family dinner', owner: 'priya', start: 1110, end: 1155, location: 'Home', kind: 'dinner', status: 'scheduled', flexible: true },
    ],
    preferences: { maxExtraCost: 20, preferFamily: true, protectDinner: true },
    plans: [], activePlanId: null, journal: [], executionReceipts: [], lastExecution: null,
    conversation: [{ id: 'welcome', role: 'assistant', text: "Your afternoon is connected. Tell me what changed, and I’ll work out a recovery you can review. This is a scripted household sandbox." }],
  };
}

function journal(state, type, title, detail) {
  // The fixture clock makes dry previews and actual MCP execution reproducible.
  const tick = state.revision * 100 + state.journal.length;
  state.journal.unshift({ id: `event-${tick}`, at: new Date(Date.UTC(2026, 9, 15, 8, 30) + tick * 1000).toISOString(), type, title, detail });
}

export function migrateHousehold(input) {
  const state = copy(input);
  if (state.schemaVersion !== 2) {
    state.schemaVersion = 2;
    state.disruptions = state.scenario ? [{ id: state.scenario, title: 'Previous disruption retained' }] : [];
    state.blockedVariants = [];
    state.importedCalendar = [];
    state.lastFailure = null;
    state.plans = [];
    state.activePlanId = null;
    state.revision += 1;
    if (state.phase === 'planned' || state.phase === 'rolled_back') state.phase = 'disrupted';
  }
  return state;
}

export function applyDisruption(input, scenario, options = {}) {
  if (!SCENARIOS.includes(scenario)) fail('Choose partner delayed, school early, or car unavailable.', 'INVALID_SCENARIO');
  const state = migrateHousehold(input);
  const seed = createHousehold();
  state.scenario = scenario;
  state.phase = 'disrupted';
  state.revision += 1;
  state.plans = [];
  state.activePlanId = null;
  state.lastExecution = null;
  const pickup = task(state, 'pickup');
  pickup.status = 'conflict';
  if (scenario === 'partner-delayed') {
    const delay = options.delayMinutes ?? 100;
    if (!Number.isInteger(delay) || delay < 0 || delay > 480) fail('Delay must be 0–480 whole minutes.', 'INVALID_ARGUMENT');
    member(state, 'alex').availableFrom = member(seed, 'alex').availableFrom + delay;
    task(state, 'grocery').status = 'conflict';
    journal(state, 'disruption', `Alex delayed by ${delay} minutes`, `Alex is available from ${formatTime(member(state, 'alex').availableFrom)} (${delay} minutes later). Previous household facts are retained.`);
  } else if (scenario === 'school-early') {
    const deadline = options.pickupTime ?? 910;
    if (!Number.isInteger(deadline) || deadline < 840 || deadline > 1200) fail('Pickup must be between 2:00 and 8:00 PM.', 'INVALID_ARGUMENT');
    pickup.originalStart = pickup.start;
    pickup.start = deadline;
    pickup.end = deadline + 10;
    journal(state, 'disruption', `School pickup is ${formatTime(deadline)}`, 'The pickup deadline changed. Earlier delays, permissions and calendar commitments remain in place.');
  } else if (scenario === 'car-unavailable') {
    const travel = options.travelMinutes ?? 55;
    if (!Number.isInteger(travel) || travel < 1 || travel > 180) fail('Travel time must be 1–180 whole minutes.', 'INVALID_ARGUMENT');
    member(state, 'alex').travelMinutes = travel;
    task(state, 'grocery').status = 'conflict';
    journal(state, 'disruption', 'Alex’s car is unavailable', `Alex now needs ${travel} travel minutes. Other household facts are retained.`);
  } else {
    member(state, 'morgan').availabilityConfirmed = false;
    journal(state, 'disruption', 'Morgan is unavailable', 'The trusted backup can no longer cover pickup. No permission or availability is invented.');
  }
  const latest = state.journal[0];
  state.disruptions = [...state.disruptions.filter(event => event.id !== scenario), { id: scenario, title: latest.title }];
  return state;
}

export function setConstraint(input, args) {
  const state = migrateHousehold(input);
  if (args.kind === 'meeting-lock') {
    if (typeof args.value !== 'boolean') fail('Meeting lock must be true or false.', 'INVALID_ARGUMENT');
    const meeting = task(state, args.taskId ?? 'meeting');
    if (!meeting || meeting.kind !== 'work') fail('Choose an existing work commitment.', 'INVALID_ARGUMENT');
    meeting.flexible = !args.value;
    journal(state, 'constraint', args.value ? 'Meeting protected' : 'Meeting can move', `${meeting.title} ${args.value ? 'is locked to its current owner and time' : 'may move if feasible'}.`);
  } else fail('Unknown constraint type.', 'INVALID_ARGUMENT');
  state.revision += 1;
  state.lastExecution = null;
  state.scenario ??= 'constraints-updated';
  generatePlans(state);
  return state;
}

export function importCalendar(input, args) {
  const preview = previewCalendar(args.text, args.ownerId, args.day);
  const state = migrateHousehold(input);
  state.tasks = state.tasks.filter(item => !item.id.startsWith(`calendar-${preview.ownerId}-`));
  const imported = preview.events.map((event, index) => ({ ...event, id: `calendar-${preview.ownerId}-${index}` }));
  if (preview.ownerId === 'priya') {
    const primary = imported.shift();
    state.tasks = state.tasks.map(item => item.id === 'meeting' ? { ...primary, id: 'meeting' } : item);
  }
  state.tasks.push(...imported);
  state.calendarDate = preview.day;
  state.importedCalendar = [...state.importedCalendar.filter(item => item.ownerId !== preview.ownerId), { ownerId: preview.ownerId, day: preview.day, count: preview.events.length }];
  state.revision += 1;
  state.lastExecution = null;
  state.scenario ??= 'calendar-imported';
  generatePlans(state);
  journal(state, 'calendar', 'Calendar commitments imported', `${preview.events.length} fixed commitments for ${preview.ownerId} on ${preview.day}. No source calendar was modified.`);
  return state;
}

function changesBetween(before, after, state) {
  const changes = [];
  for (const original of before) {
    const updated = after.find((item) => item.id === original.id);
    for (const field of FIELDS) {
      if (original[field] === updated[field]) continue;
      const value = (item) => field === 'owner' ? member(state, item)?.name || item : (field === 'start' || field === 'end') ? formatTime(item) : item;
      changes.push({ taskId: original.id, field, before: original[field], after: updated[field], label: `${original.title}: ${field} ${value(original[field])} → ${value(updated[field])}` });
    }
  }
  return changes;
}

function applyChanges(tasks, changes, validateBefore = false) {
  const result = copy(tasks);
  for (const change of changes) {
    const item = result.find((entry) => entry.id === change.taskId);
    if (!item || !FIELDS.includes(change.field)) fail('The proposal contains an unsupported change.', 'INVALID_CHANGE');
    if (validateBefore && item[change.field] !== change.before) fail('The afternoon changed. Generate a fresh proposal.', 'STALE_PLAN');
    item[change.field] = change.after;
  }
  return result;
}

function constraints(state, tasks, extraCost) {
  const reasons = [];
  const pickup = tasks.find((item) => item.kind === 'pickup');
  const originalPickup = task(state, 'pickup');
  if (pickup.start > originalPickup.start) reasons.push(`School pickup would be ${pickup.start - originalPickup.start} minutes late; the deadline is ${formatTime(originalPickup.start)}.`);
  if (extraCost > state.preferences.maxExtraCost) reasons.push(`$${extraCost} exceeds your $${state.preferences.maxExtraCost} extra-cost limit.`);
  for (const person of state.members) {
    const assigned = tasks.filter((item) => item.owner === person.id).sort((a, b) => a.start - b.start);
    for (let index = 0; index < assigned.length; index += 1) {
      const item = assigned[index];
      if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start) reasons.push(`${item.title} has an invalid time window.`);
      if (item.kind !== 'work' && (item.start < person.availableFrom || item.end > person.availableUntil)) reasons.push(`${person.name} is not available for ${item.title} at ${formatTime(item.start)}.`);
      if (!person.availabilityConfirmed) reasons.push(`${person.name} has not confirmed availability.`);
      if (item.kind === 'pickup' && !person.authorizedPickup) reasons.push(`${person.name} is not authorized to collect Sam.`);
      const previous = assigned[index - 1];
      if (previous) {
        const travel = previous.location === item.location ? 0 : person.travelMinutes;
        if (previous.end + travel > item.start) reasons.push(`${person.name} needs ${travel} travel minutes between ${previous.title} and ${item.title}; those commitments overlap.`);
      } else if (['pickup', 'grocery'].includes(item.kind) && person.availableFrom + person.travelMinutes > item.start) {
        reasons.push(`${person.name} cannot arrive before ${formatTime(person.availableFrom + person.travelMinutes)} with ${person.travelMinutes} minutes of travel.`);
      }
    }
  }
  for (const item of tasks) if (!member(state, item.owner)) reasons.push(`${item.title} has an unknown owner.`);
  for (const original of state.tasks.filter(item => item.kind === 'work' && !item.flexible)) {
    const changed = tasks.find(item => item.id === original.id);
    if (!changed || changed.start !== original.start || changed.end !== original.end || changed.owner !== original.owner) reasons.push(`${original.title} is locked and cannot move.`);
  }
  const dinner = tasks.find((item) => item.kind === 'dinner');
  const originalDinner = task(state, 'dinner');
  if (state.preferences.protectDinner && (dinner.start !== originalDinner.start || dinner.end !== originalDinner.end)) reasons.push('Family dinner is protected and cannot move.');
  return [...new Set(reasons)];
}

function candidate(state, variant) {
  const tasks = copy(state.tasks);
  const pickup = tasks.find((item) => item.id === 'pickup');
  const grocery = tasks.find((item) => item.id === 'grocery');
  const meeting = tasks.find((item) => item.id === 'meeting');
  const alex = member(state, 'alex');
  const priya = member(state, 'priya');
  let extraCost = 0;
  let title;
  let subtitle;
  let reasons;
  let tradeoffs;
  if (variant === 'family') {
    pickup.owner = 'priya';
    const duration = meeting.end - meeting.start;
    const overlapsPickup = meeting.end + priya.travelMinutes > pickup.start && meeting.start < pickup.end + priya.travelMinutes;
    const shiftedStart = overlapsPickup ? Math.max(meeting.start, pickup.end + priya.travelMinutes) : meeting.start;
    if (shiftedStart !== meeting.start && !meeting.flexible) {
      // Leave the locked meeting in place so ordinary overlap validation rejects it.
    } else {
      meeting.start = shiftedStart;
      meeting.end = shiftedStart + duration;
    }
    title = 'Keep it in the family';
    subtitle = `Priya collects Sam at ${formatTime(pickup.start)}. Alex handles groceries when available.`;
    reasons = [`Priya's pickup permission: ${priya.authorizedPickup ? 'approved' : 'missing'}; availability: ${priya.availabilityConfirmed ? 'confirmed' : 'unconfirmed'}.`, `Allow ${priya.travelMinutes} minutes for Priya to travel after pickup.`, 'No paid backup is required.'];
    tradeoffs = [meeting.start === task(state, 'meeting').start ? 'Priya’s meeting stays in place.' : `Priya’s flexible meeting moves to ${formatTime(meeting.start)}–${formatTime(meeting.end)}.`];
  } else if (variant === 'backup') {
    pickup.owner = 'morgan';
    extraCost = (state.disruptions ?? []).some(event => event.id === 'school-early') ? 8 : state.scenario === 'school-early' ? 8 : 12;
    title = 'Call on your trusted backup';
    subtitle = `Morgan collects Sam at ${formatTime(pickup.start)}. Priya's meeting stays at ${formatTime(meeting.start)}.`;
    const morgan = member(state, 'morgan');
    reasons = [`Morgan's pickup permission: ${morgan.authorizedPickup ? 'approved' : 'missing'}; availability: ${morgan.availabilityConfirmed ? 'confirmed' : 'unconfirmed'}.`, `Morgan’s route takes ${morgan.travelMinutes} minutes.`, 'Priya’s meeting remains uninterrupted.'];
    tradeoffs = [`$${extraCost} fixture travel reimbursement.`, 'Uses the trusted backup’s previously confirmed pickup window.'];
  } else {
    const arrival = Math.max(pickup.start, alex.availableFrom + alex.travelMinutes);
    pickup.start = arrival;
    pickup.end = arrival + 10;
    title = 'Wait for Alex';
    subtitle = `Alex’s earliest arrival is ${formatTime(arrival)}.`;
    reasons = ['Keeps the original pickup owner.', `Alex needs ${alex.travelMinutes} travel minutes after becoming available.`];
    tradeoffs = ['School’s collection deadline is a hard constraint.'];
  }
  const earliestGrocery = Math.max(grocery.start, alex.availableFrom + alex.travelMinutes, pickup.owner === 'alex' ? pickup.end + alex.travelMinutes : 0);
  const groceryDuration = grocery.end - grocery.start;
  if (grocery.flexible) { grocery.start = earliestGrocery; grocery.end = earliestGrocery + groceryDuration; }
  for (const item of tasks) {
    const original = task(state, item.id);
    if (item.status === 'conflict' || item.owner !== original.owner || item.start !== original.start || item.end !== original.end) item.status = 'updated';
  }
  const rejected = constraints(state, tasks, extraCost);
  if ((state.blockedVariants ?? []).includes(variant)) rejected.push('This workflow failed persistently and is unavailable for this afternoon. Choose another option.');
  const feasible = rejected.length === 0;
  const changes = changesBetween(state.tasks, tasks, state);
  let score = variant === 'family' ? (state.preferences.preferFamily ? 96 : 82) : variant === 'backup' ? (state.preferences.preferFamily ? 87 : 97) : 65;
  score -= Math.round(extraCost / 4);
  if (!feasible) score = Math.max(0, score - 60);
  if (grocery.start !== task(state, 'grocery').start) tradeoffs.push(`Groceries move to ${formatTime(grocery.start)}–${formatTime(grocery.end)}.`);
  reasons.push(`Dinner remains at ${formatTime(task(state, 'dinner').start)}.`);
  return { id: `${state.scenario}-r${state.revision}-${variant}`, variant, title, subtitle, feasible, score, extraCost, changes, reasons: [...reasons, ...rejected], tradeoffs, baseRevision: state.revision };
}

function generatePlans(state) {
  if (!state.scenario) { state.plans = []; state.activePlanId = null; return; }
  state.plans = ['family', 'backup', 'original'].map((variant) => candidate(state, variant))
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score || a.id.localeCompare(b.id));
  state.activePlanId = state.plans.find((plan) => plan.feasible)?.id ?? null;
  state.phase = 'planned';
}

export function buildPlans(input) {
  const state = copy(input);
  if (!state.scenario) return state;
  if (state.phase === 'resolved') return state;
  state.revision += 1;
  generatePlans(state);
  journal(state, 'proposal', 'Recovery options checked', `${state.plans.filter((plan) => plan.feasible).length} feasible options checked against arrival times, availability, pickup permission, dinner and budget. No changes applied.`);
  return state;
}

function findPlan(state, planId) {
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) fail('This proposal is no longer available. Generate a fresh recovery.', 'PLAN_NOT_FOUND');
  if (plan.baseRevision !== state.revision) fail('This proposal is out of date. Generate a fresh recovery.', 'STALE_PLAN');
  const result = applyChanges(state.tasks, plan.changes, true);
  const rejected = constraints(state, result, plan.extraCost);
  if (!plan.feasible || rejected.length) fail(`This option cannot be applied: ${rejected.join(' ') || plan.reasons.join(' ')}`, 'INFEASIBLE_PLAN');
  return plan;
}

export function executePlan(input, planId, options = {}) {
  if (options.confirmed !== true) fail('Review the changes and explicitly confirm before applying this recovery.', 'CONFIRMATION_REQUIRED');
  const receipt = (input.executionReceipts || []).find((item) => item.planId === planId);
  if (receipt?.status === 'applied') {
    const currentExecution = input.lastExecution;
    if (input.phase === 'resolved' && currentExecution?.status === 'applied' && currentExecution.planId === planId && currentExecution.scenario === input.scenario) return copy(input);
    fail('That recovery belongs to an earlier afternoon. Generate and review a current proposal.', 'STALE_PLAN');
  }
  if (receipt?.status === 'undone') fail('That recovery was undone. Generate a fresh proposal to apply again.', 'STALE_PLAN');
  const plan = findPlan(input, planId);
  if (options.failAt !== undefined && (!Number.isInteger(options.failAt) || options.failAt < 0 || options.failAt >= plan.changes.length)) fail('Failure index must point to a change in this plan.', 'INVALID_FAILURE_INDEX');
  const state = copy(input);
  const beforeTasks = copy(state.tasks);
  try {
    for (let index = 0; index < plan.changes.length; index += 1) {
      if (index === options.failAt) fail('Sandbox calendar service rejected the change.', 'SERVICE_FAILURE');
      state.tasks = applyChanges(state.tasks, [plan.changes[index]], true);
    }
  } catch (error) {
    state.tasks = beforeTasks;
    state.revision += 1;
    state.phase = 'rolled_back';
    if (options.adaptive === true) {
      state.blockedVariants = [...new Set([...(state.blockedVariants ?? []), plan.variant ?? plan.id.split('-').at(-1)])];
      state.lastFailure = { title: plan.title, detail: 'The failed workflow has been excluded. New alternatives require a fresh approval.' };
      generatePlans(state);
      state.phase = 'rolled_back';
    } else {
      state.plans = state.plans.map((item) => ({ ...item, baseRevision: state.revision }));
      state.activePlanId = plan.id;
    }
    journal(state, 'rollback', 'All changes rolled back', `${error.message} All tasks were restored. ${options.adaptive ? 'The failed workflow is blocked and fresh alternatives have been checked.' : `${plan.title} is ready to retry after review.`}`);
    return state;
  }
  state.revision += 1;
  state.phase = 'resolved';
  state.plans = [];
  state.activePlanId = null;
  state.lastExecution = { id: `execution-${state.revision}`, planId, title: plan.title, taskSnapshot: beforeTasks, afterTasks: copy(state.tasks), scenario: state.scenario, status: 'applied', appliedAtRevision: state.revision };
  state.executionReceipts = [...(state.executionReceipts || []), { id: state.lastExecution.id, planId, status: 'applied' }];
  for (const change of plan.changes) journal(state, 'receipt', 'Sandbox change applied', change.label);
  journal(state, 'execution', 'Afternoon recovered', `${plan.title}. ${plan.changes.length} field changes applied atomically. Extra fixture cost: $${plan.extraCost}. No external messages or bookings were made.`);
  return state;
}

export function undoLastExecution(input) {
  if (!input.lastExecution || input.lastExecution.status !== 'applied') fail('There is no applied recovery to undo.', 'NOTHING_TO_UNDO');
  const state = copy(input);
  const execution = state.lastExecution;
  state.tasks = copy(execution.taskSnapshot);
  state.revision += 1;
  state.phase = 'disrupted';
  state.plans = [];
  state.activePlanId = null;
  execution.status = 'undone';
  state.executionReceipts = state.executionReceipts.map((item) => item.planId === execution.planId ? { ...item, status: 'undone' } : item);
  journal(state, 'undo', 'Recovery undone', `${execution.title} was reversed. Your latest budget and household preferences were preserved. Review a fresh proposal to recover again.`);
  return state;
}

export function updatePreference(input, key, value) {
  if (!['maxExtraCost', 'preferFamily', 'protectDinner'].includes(key)) fail('Unknown household preference.', 'INVALID_PREFERENCE');
  if (key === 'maxExtraCost' ? typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 : typeof value !== 'boolean') fail(key === 'maxExtraCost' ? 'Budget must be a number between $0 and $100.' : 'This preference must be true or false.', 'INVALID_PREFERENCE');
  const state = copy(input);
  state.preferences[key] = value;
  state.revision += 1;
  state.plans = [];
  state.activePlanId = null;
  if (state.scenario && state.phase !== 'resolved') generatePlans(state);
  journal(state, 'preference', 'Household preference remembered', `${key}: ${String(value)}. Existing proposals were invalidated; any new options use the updated constraint.`);
  return state;
}

export const toolDefinitions = [
  { name: 'get_household', description: 'Read the sandbox household, current afternoon, remembered preferences and recovery proposals.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'report_disruption', description: 'Add a disruption to current facts without resetting earlier changes. Times are minutes after midnight; delays are relative to the original availability.', inputSchema: { type: 'object', properties: { scenario: { type: 'string', enum: SCENARIOS }, delayMinutes: { type: 'integer', minimum: 0, maximum: 480 }, pickupTime: { type: 'integer', minimum: 840, maximum: 1200 }, travelMinutes: { type: 'integer', minimum: 1, maximum: 180 } }, required: ['scenario'], additionalProperties: false } },
  { name: 'set_constraint', description: 'Lock or unlock an existing work commitment at its current time and owner. Locked meetings are hard constraints.', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['meeting-lock'] }, taskId: { type: 'string' }, value: { type: 'boolean' } }, required: ['kind', 'value'], additionalProperties: false } },
  { name: 'import_calendar', description: 'Import explicitly supplied single-day timed ICS commitments as locked work events. Never modifies the source calendar or grants pickup permission.', inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 50000 }, ownerId: { type: 'string', enum: ['alex', 'priya'] }, day: { type: 'string' } }, required: ['text', 'ownerId'], additionalProperties: false } },
  { name: 'propose_recovery', description: 'Rank concrete options against confirmed availability, pickup permission, travel, budget and dinner.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'set_preference', description: 'Remember a household budget or preference and invalidate stale proposals.', inputSchema: { type: 'object', properties: { key: { type: 'string', enum: ['maxExtraCost', 'preferFamily', 'protectDinner'] }, value: { anyOf: [{ type: 'number', minimum: 0, maximum: 100 }, { type: 'boolean' }] } }, required: ['key', 'value'], additionalProperties: false } },
  { name: 'confirm_recovery', description: 'Read-only review of an available recovery with exact before/after changes. This tool does not grant execution authority.', inputSchema: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'], additionalProperties: false } },
  { name: 'execute_recovery', description: 'Apply a reviewed sandbox recovery atomically with explicit confirmation. failAt injects failure; adaptive:true blocks the failed workflow and generates fresh alternatives after restoring tasks.', inputSchema: { type: 'object', properties: { planId: { type: 'string' }, confirmed: { type: 'boolean' }, failAt: { type: 'integer', minimum: 0 }, adaptive: { type: 'boolean' } }, required: ['planId', 'confirmed'], additionalProperties: false } },
  { name: 'undo_recovery', description: 'Reverse the latest applied sandbox recovery while retaining later household preferences.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_journal', description: 'Read actual proposal, execution, rollback, undo and preference receipts in the sandbox audit journal.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

export function runTool(input, name, args = {}) {
  let state = copy(input);
  let result;
  switch (name) {
    case 'get_household': result = copy(state); break;
    case 'report_disruption': state = applyDisruption(state, args.scenario, args); result = { scenario: state.scenario, phase: state.phase, revision: state.revision }; break;
    case 'set_constraint': state = setConstraint(state, args); result = { plans: state.plans, revision: state.revision }; break;
    case 'import_calendar': state = importCalendar(state, args); result = { importedCalendar: state.importedCalendar, plans: state.plans, revision: state.revision }; break;
    case 'propose_recovery': state = buildPlans(state); result = { plans: copy(state.plans), activePlanId: state.activePlanId, revision: state.revision }; break;
    case 'set_preference': state = updatePreference(state, args.key, args.value); result = { preferences: copy(state.preferences), plans: copy(state.plans), revision: state.revision }; break;
    case 'confirm_recovery': {
      const plan = findPlan(state, args.planId);
      result = { planId: plan.id, title: plan.title, extraCost: plan.extraCost, changes: copy(plan.changes), requiresConfirmation: true, description: `Review ${plan.title}: ${plan.changes.length} field changes and $${plan.extraCost} extra fixture cost. Explicit confirmation is required.` }; break;
    }
    case 'execute_recovery': {
      const alreadyApplied = (state.executionReceipts || []).some((receipt) => receipt.planId === args.planId && receipt.status === 'applied');
      state = executePlan(state, args.planId, args);
      result = { planId: args.planId, phase: state.phase, applied: state.phase === 'resolved', rolledBack: state.phase === 'rolled_back', idempotent: alreadyApplied, revision: state.revision }; break;
    }
    case 'undo_recovery': state = undoLastExecution(state); result = { phase: state.phase, revision: state.revision }; break;
    case 'get_journal': result = copy(state.journal); break;
    default: fail(`Unknown Relay tool: ${name}`, 'UNKNOWN_TOOL');
  }
  return { state, result };
}

function describePlan(state) {
  const plan = state.plans.find((item) => item.id === state.activePlanId);
  if (!plan) return 'No recovery currently meets every constraint. Pickup cannot safely be reassigned with the current meeting lock, availability, travel and budget. Review the rejected options; a verified availability change or an explicitly relaxed constraint is needed.';
  return `${plan.title}: ${plan.subtitle} ${plan.tradeoffs.join(' ')} Extra fixture cost: $${plan.extraCost}. Dinner stays at ${formatTime(task(state, 'dinner').start)}. Review the changes, then say “apply the plan” to confirm.`;
}

export function respond(input, message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) fail('Enter a message between 1 and 4,000 characters.', 'INVALID_MESSAGE');
  let state = copy(input);
  const trace = [];
  const original = message.trim();
  const text = original.toLowerCase().replace(/[’]/g, "'").trim();
  const compact = text.replace(/[.!?]+$/g, '').trim();
  const invoke = (name, args = {}) => {
    try {
      const outcome = runTool(state, name, args);
      state = outcome.state;
      const summaries = {
        set_constraint: 'Updated a hard meeting constraint and rechecked proposals.',
        import_calendar: 'Imported fixed calendar commitments after validation.',
        get_household: 'Read current commitments and household preferences.',
        report_disruption: 'Recorded the disruption; existing plans are invalid.',
        propose_recovery: 'Checked availability, travel, permission and budget; ranked recovery options.',
        set_preference: 'Remembered your preference and refreshed unresolved proposals.',
        confirm_recovery: 'Read exact changes for review; confirmation remains explicit.',
        execute_recovery: state.phase === 'rolled_back' ? 'Service failure: all task changes rolled back.' : outcome.result.idempotent ? 'Existing execution receipt found; no changes repeated.' : 'Applied confirmed changes atomically and recorded receipts.',
        undo_recovery: 'Restored the previous tasks and kept later preferences.',
        get_journal: 'Read actual sandbox audit receipts.',
      };
      trace.push({ tool: name, status: state.phase === 'rolled_back' && name === 'execute_recovery' ? 'failed' : 'complete', summary: summaries[name], args: copy(args) });
      return outcome.result;
    } catch (error) {
      trace.push({ tool: name, status: 'failed', summary: error.message, args: copy(args) });
      throw error;
    }
  };
  let reply;
  try {
    const negation = /\b(no|nope|not|never|cancel|stop)\b|don't|do not|hold off/.test(text);
    const approval = /^(yes|apply(?: the)?(?: recommended| selected)? plan|go ahead|confirm(?: the)? plan|approve(?: the)? plan|yes,? (?:apply(?: the)?(?: selected)? plan|go ahead))$/.test(compact);
    const budget = text.match(/\b(under|budget(?: of)?|limit(?: of)?|maximum|max|at most)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
    const facts = [];
    if (/\b(?:alex|partner|train)\b[^.!;]*\b(?:delay(?:ed)?|late|stuck)\b/.test(text) && !/\b(?:not|never)\s+(?:delay(?:ed)?|late)|isn't (?:delayed|late)/.test(text)) {
      const amount = text.match(/(?:by\s+|delayed\s+|late\s+)?(\d{1,3})\s*(?:minutes?|mins?)\b/);
      facts.push(['report_disruption', { scenario: 'partner-delayed', ...(amount ? { delayMinutes: Number(amount[1]) } : {}) }]);
    }
    if (/\bschool\b/.test(text) && /early|closes|closing|pickup/.test(text) && !/school (?:doesn't|does not|won't) clos/.test(text)) {
      const clock = text.match(/(?:closes?|closing|pickup(?: at)?)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
      let minutes;
      if (clock) { let hour = Number(clock[1]); if (clock[3] === 'pm' && hour < 12 || !clock[3] && hour < 8) hour += 12; minutes = hour * 60 + Number(clock[2] ?? 0); }
      facts.push(['report_disruption', { scenario: 'school-early', ...(minutes !== undefined ? { pickupTime: minutes } : {}) }]);
    }
    if (/\bcar\b/.test(text) && /unavailable|broken|broke|won't|can't|trouble|no car/.test(text)) {
      const travel = text.match(/(?:travel|route|transit)(?: takes?)?\s+(\d{1,3})\s*(?:minutes?|mins?)/);
      facts.push(['report_disruption', { scenario: 'car-unavailable', ...(travel ? { travelMinutes: +travel[1] } : {}) }]);
    }
    if (/\bmorgan\b[^.!;]*\b(?:unavailable|can't|cannot|cancelled|canceled|not available)\b/.test(text)) facts.push(['report_disruption', { scenario: 'backup-unavailable' }]);
    if (/(?:don't|do not|never) move (?:my |the |priya'?s )?(?:client )?(?:call|meeting)|protect (?:my |the )?(?:client )?(?:call|meeting)|lock (?:my |the )?(?:client )?(?:call|meeting)/.test(text)) facts.push(['set_constraint', { kind: 'meeting-lock', taskId: 'meeting', value: true }]);
    if (/unlock (?:my |the )?(?:client )?(?:call|meeting)|(?:call|meeting) can move/.test(text)) facts.push(['set_constraint', { kind: 'meeting-lock', taskId: 'meeting', value: false }]);
    let scenario;
    if (/school/.test(text) && /early|closes|closing|3:10/.test(text)) scenario = 'school-early';
    else if (/car/.test(text) && /unavailable|broken|broke|won't|can't|trouble|no car/.test(text)) scenario = 'car-unavailable';
    else if (/alex|partner|train|running/.test(text) && /delay|late|stuck/.test(text)) scenario = 'partner-delayed';
    if (facts.length) {
      for (const [name, args] of facts) invoke(name, args);
      if (budget) {
        const value = Math.max(0, Number(budget[2]) - (budget[1] === 'under' ? 0.01 : 0));
        invoke('set_preference', { key: 'maxExtraCost', value: Math.round(value * 100) / 100 });
      }
      invoke('propose_recovery');
      reply = `${facts.length} household fact${facts.length === 1 ? '' : 's'} updated; earlier facts preserved. ${describePlan(state)}`;
    } else if (scenario && !negation) {
      invoke('report_disruption', { scenario });
      invoke('propose_recovery');
      reply = describePlan(state);
    } else if (budget && !negation) {
      const value = Math.max(0, Number(budget[2]) - (budget[1] === 'under' ? 0.01 : 0));
      invoke('set_preference', { key: 'maxExtraCost', value: Math.round(value * 100) / 100 });
      reply = `I remembered an extra-cost limit of $${state.preferences.maxExtraCost}. ${state.scenario && state.phase !== 'resolved' ? describePlan(state) : 'Your current tasks are unchanged.'}`;
    } else if (/keep it in the family|prefer family|use priya/.test(text) && !negation) {
      invoke('set_preference', { key: 'preferFamily', value: true });
      reply = `Family options will rank first when feasible. ${state.scenario && state.phase !== 'resolved' ? describePlan(state) : 'That preference is remembered for the next disruption.'}`;
    } else if (/prefer (?:the )?backup|use morgan|protect (?:my |the )?meeting/.test(text) && !negation) {
      invoke('set_preference', { key: 'preferFamily', value: false });
      reply = `I’ll favor your confirmed backup when the budget permits. ${state.scenario && state.phase !== 'resolved' ? describePlan(state) : 'That preference is remembered for the next disruption.'}`;
    } else if (/^(undo|undo(?: the)?(?: last)? (?:plan|recovery|changes)|undo that)$/.test(compact) && !negation) {
      invoke('undo_recovery');
      invoke('propose_recovery');
      reply = `Recovery undone. Your latest preferences are intact. ${describePlan(state)}`;
    } else if (compact === 'test a service failure' && !negation) {
      if (!state.scenario) fail('Choose a disruption before testing a service failure.', 'NO_DISRUPTION');
      if (!state.activePlanId) invoke('propose_recovery');
      const plan = state.plans.find((item) => item.id === state.activePlanId);
      if (!plan) fail('No feasible recovery is available for a failure test.', 'INFEASIBLE_PLAN');
      invoke('confirm_recovery', { planId: plan.id });
      invoke('execute_recovery', { planId: plan.id, confirmed: true, failAt: Math.min(2, plan.changes.length - 1), adaptive: true });
      reply = `The persistent service failure restored every task. The failed workflow is excluded and fresh options require review. ${describePlan(state)}`;
    } else if (approval && !negation) {
      if (!state.activePlanId) fail(state.phase === 'resolved' ? 'Your recovery is already applied. There is no new plan awaiting approval.' : 'Generate and review a feasible recovery before approving it.', 'NO_PLAN');
      // Hosts may set activePlanId from a validated, explicit caller selection.
      // The review and execution tools still verify freshness and feasibility.
      const planId = state.activePlanId;
      invoke('confirm_recovery', { planId });
      invoke('execute_recovery', { planId, confirmed: true });
      const pickup = task(state, 'pickup');
      reply = `Done in the sandbox. ${member(state, pickup.owner).name} collects Sam at ${formatTime(pickup.start)}, groceries are at ${formatTime(task(state, 'grocery').start)}, and dinner stays at ${formatTime(task(state, 'dinner').start)}. Every change has a receipt; you can undo this recovery.`;
    } else if (/\bwho(?:'s)?\b.*\b(?:pick(?:ing|s)?|collect(?:ing|s)?|pickup)\b|\bpickup status\b/.test(text)) {
      invoke('get_household');
      const pickup = task(state, 'pickup');
      const assignment = `${member(state, pickup.owner).name} is currently assigned to collect Sam at ${formatTime(pickup.start)}.`;
      const status = pickup.status === 'conflict'
        ? 'That assignment conflicts with the disruption. Recovery proposals still need explicit approval before the caregiver changes.'
        : state.phase === 'resolved'
          ? 'The recovery has been applied in the sandbox.'
          : 'This is the scheduled sandbox assignment.';
      reply = `${assignment} ${status}`;
    } else if (/why|explain|reason/.test(text)) {
      invoke('get_household');
      const plan = state.plans.find((item) => item.id === state.activePlanId);
      reply = plan ? `${plan.title} ranks first because ${plan.reasons.join(' ')} Tradeoffs: ${plan.tradeoffs.join(' ')}` : 'Report a disruption and I’ll explain the constraints behind a proposed recovery.';
    } else if (/show (?:the )?plan|replan|propose|options|recovery/.test(text) && !negation) {
      invoke('propose_recovery');
      reply = state.scenario ? state.phase === 'resolved' ? 'The recovery is already applied. Undo it or choose a new disruption to explore another proposal.' : describePlan(state) : 'Tell me Alex is delayed, school closes early, or the car is unavailable to generate recovery options.';
    } else if (/journal|activity|receipt/.test(text)) {
      const entries = invoke('get_journal');
      reply = entries.length ? entries.slice(0, 3).map((entry) => `${entry.title}: ${entry.detail}`).join(' ') : 'No changes have been made yet. The journal will record actual proposals, approvals, failures and undo actions.';
    } else if (/status|summary|today|afternoon/.test(text)) {
      invoke('get_household');
      const pickup = task(state, 'pickup');
      reply = `${state.phase === 'resolved' ? 'The afternoon is recovered.' : state.scenario ? 'The disruption is awaiting a recovery.' : 'Your afternoon is on schedule.'} ${member(state, pickup.owner).name} is assigned school pickup at ${formatTime(pickup.start)}; groceries are at ${formatTime(task(state, 'grocery').start)}; dinner is at ${formatTime(task(state, 'dinner').start)}. Extra-cost limit: $${state.preferences.maxExtraCost}.`;
    } else if (negation) {
      reply = 'No recovery was applied. You can review alternatives, change your budget, or explicitly say “apply the plan” when ready.';
    } else {
      reply = 'This demo uses a scripted host with supported household intents. Try “Alex is delayed,” “school closes early,” “the car is unavailable,” “budget $5,” “keep it in the family,” “use Morgan,” “why,” “apply the plan,” or “undo.”';
    }
  } catch (error) { reply = error.message; }
  const index = state.conversation.length;
  state.conversation.push({ id: `chat-${index}-user`, role: 'user', text: original }, { id: `chat-${index + 1}-assistant`, role: 'assistant', text: reply });
  return { state, reply, trace };
}

/** Dry-preview the exact ordered operations for a real MCP-backed chat host. */
export function interpretMessage(state, message) {
  const preview = respond(state, message);
  return { calls: preview.trace.map(({ tool, args }) => ({ name: tool, args })), reply: preview.reply, conversation: preview.state.conversation, trace: preview.trace };
}
