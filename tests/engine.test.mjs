import test from 'node:test';
import assert from 'node:assert/strict';
import { createHousehold, applyDisruption, buildPlans, executePlan, undoLastExecution, updatePreference, respond, runTool, interpretMessage, toolDefinitions } from '../shared/engine.mjs';

const planned = (scenario = 'partner-delayed') => buildPlans(applyDisruption(createHousehold(), scenario));
const best = (state) => state.plans.find((plan) => plan.id === state.activePlanId);
const clone = (value) => JSON.parse(JSON.stringify(value));

test('all three scenarios produce different feasible recoveries and explain the late original option', () => {
  const signatures = [];
  for (const scenario of ['partner-delayed', 'school-early', 'car-unavailable']) {
    const state = planned(scenario);
    assert.equal(state.plans.filter((plan) => plan.feasible).length, 2);
    assert.equal(best(state).title, 'Keep it in the family');
    const late = state.plans.find((plan) => plan.title === 'Wait for Alex');
    assert.equal(late.feasible, false);
    assert(late.reasons.some((reason) => reason.includes('late')));
    const applied = executePlan(state, best(state).id, { confirmed: true });
    assert.equal(applied.phase, 'resolved');
    assert.equal(applied.tasks.find((task) => task.id === 'pickup').owner, 'priya');
    assert.equal(applied.tasks.find((task) => task.id === 'dinner').start, 1110);
    signatures.push(JSON.stringify(applied.tasks));
  }
  assert.equal(new Set(signatures).size, 3);
});

test('mutators preserve caller state and every proposal shows accurate before and after values', () => {
  const original = createHousehold();
  const snapshot = clone(original);
  const disrupted = applyDisruption(original, 'partner-delayed');
  assert.deepEqual(original, snapshot);
  const disruptedSnapshot = clone(disrupted);
  const state = buildPlans(disrupted);
  assert.deepEqual(disrupted, disruptedSnapshot);
  for (const plan of state.plans) for (const change of plan.changes) {
    assert.equal(change.before, state.tasks.find((task) => task.id === change.taskId)[change.field]);
    assert.notEqual(change.before, change.after);
  }
  const stateSnapshot = clone(state);
  executePlan(state, best(state).id, { confirmed: true });
  assert.deepEqual(state, stateSnapshot);
});

test('budget and family preference alter feasibility and ranking', () => {
  const state = planned();
  const backupFirst = updatePreference(state, 'preferFamily', false);
  assert.equal(best(backupFirst).title, 'Call on your trusted backup');
  const tight = updatePreference(backupFirst, 'maxExtraCost', 5);
  assert.equal(best(tight).title, 'Keep it in the family');
  assert.equal(tight.plans.find((plan) => plan.title.includes('trusted backup')).feasible, false);
  assert(tight.plans.find((plan) => plan.title.includes('trusted backup')).reasons.some((reason) => reason.includes('exceeds')));
  assert.throws(() => executePlan(tight, best(state).id, { confirmed: true }), /no longer available/);
  assert.throws(() => updatePreference(state, 'maxExtraCost', -1), /Budget/);
  assert.throws(() => updatePreference(state, 'preferFamily', 'yes'), /true or false/);
});

test('unconfirmed and unauthorized caregivers cannot receive a feasible pickup plan', () => {
  const state = applyDisruption(createHousehold(), 'school-early');
  state.members.find((member) => member.id === 'morgan').availabilityConfirmed = false;
  state.members.find((member) => member.id === 'priya').authorizedPickup = false;
  const options = buildPlans(state);
  assert.equal(options.plans.filter((plan) => plan.feasible).length, 0);
  assert.equal(options.activePlanId, null);
  assert(options.plans.some((plan) => plan.reasons.some((reason) => reason.includes('not authorized'))));
  assert(options.plans.some((plan) => plan.reasons.some((reason) => reason.includes('not confirmed'))));
  for (const plan of options.plans) assert.throws(() => executePlan(options, plan.id, { confirmed: true }), /cannot be applied/);
});

test('locked meetings, insufficient travel and availability are hard constraints', () => {
  const state = applyDisruption(createHousehold(), 'partner-delayed');
  state.tasks.find((task) => task.id === 'meeting').flexible = false;
  state.members.find((member) => member.id === 'morgan').availableFrom = 960;
  const options = buildPlans(state);
  assert.equal(options.plans.filter((plan) => plan.feasible).length, 0);
  assert(options.plans.some((plan) => plan.reasons.some((reason) => reason.includes('commitments overlap'))));
  assert(options.plans.some((plan) => plan.reasons.some((reason) => reason.includes('cannot arrive'))));
});

test('execution requires literal explicit approval and rejects stale proposals', () => {
  const state = planned();
  const id = best(state).id;
  for (const confirmed of [undefined, false, 'true', 1]) {
    assert.throws(() => executePlan(state, id, { confirmed }), (error) => error.code === 'CONFIRMATION_REQUIRED');
  }
  const stale = clone(state);
  stale.revision += 1;
  assert.throws(() => executePlan(stale, id, { confirmed: true }), (error) => error.code === 'STALE_PLAN');
  const altered = clone(state);
  altered.tasks.find((task) => task.id === 'pickup').owner = 'morgan';
  assert.throws(() => executePlan(altered, id, { confirmed: true }), (error) => error.code === 'STALE_PLAN');
});

test('confirmed execution is idempotent, and an undone receipt cannot replay', () => {
  const state = planned();
  const id = best(state).id;
  const first = executePlan(state, id, { confirmed: true });
  const second = executePlan(first, id, { confirmed: true });
  assert.deepEqual(second, first);
  assert.equal(second.executionReceipts.length, 1);
  const undone = undoLastExecution(second);
  assert.throws(() => executePlan(undone, id, { confirmed: true }), /was undone/);
});

test('historical applied receipts cannot approve a newly disrupted afternoon', () => {
  const first = planned();
  const firstId = best(first).id;
  const applied = executePlan(first, firstId, { confirmed: true });
  const disrupted = applyDisruption(applied, 'school-early');
  const snapshot = clone(disrupted);
  assert.equal(disrupted.executionReceipts[0].status, 'applied');
  assert.throws(() => executePlan(disrupted, firstId, { confirmed: true }), (error) => error.code === 'STALE_PLAN');
  assert.throws(() => runTool(disrupted, 'execute_recovery', { planId: firstId, confirmed: true }), /earlier afternoon/);
  assert.deepEqual(disrupted, snapshot);
  const second = buildPlans(disrupted);
  const secondId = best(second).id;
  const secondApplied = executePlan(second, secondId, { confirmed: true });
  assert.throws(() => executePlan(secondApplied, firstId, { confirmed: true }), /earlier afternoon/);
  assert.deepEqual(executePlan(secondApplied, secondId, { confirmed: true }), secondApplied);
  const undone = undoLastExecution(secondApplied);
  assert.deepEqual(undone.tasks, second.tasks);
  assert.equal(undone.scenario, 'school-early');
  assert.throws(() => executePlan(undone, firstId, { confirmed: true }), /earlier afternoon/);
  assert.throws(() => executePlan(undone, secondId, { confirmed: true }), /was undone/);
});

test('current recovery replay remains idempotent after remembering a later preference', () => {
  const state = planned();
  const id = best(state).id;
  const applied = executePlan(state, id, { confirmed: true });
  const remembered = updatePreference(applied, 'maxExtraCost', 5);
  assert.deepEqual(executePlan(remembered, id, { confirmed: true }), remembered);
});

test('budget validation and MCP schema share a $100 maximum', () => {
  const state = createHousehold();
  assert.equal(updatePreference(state, 'maxExtraCost', 100).preferences.maxExtraCost, 100);
  assert.throws(() => updatePreference(state, 'maxExtraCost', 100.01), /between \$0 and \$100/);
  const schema = toolDefinitions.find((definition) => definition.name === 'set_preference').inputSchema;
  assert.equal(schema.properties.value.anyOf.find((type) => type.type === 'number').maximum, 100);
});

test('each partial-service failure rolls back atomically and allows an explicit retry', () => {
  const state = planned();
  const plan = best(state);
  for (let failAt = 0; failAt < plan.changes.length; failAt += 1) {
    const failed = executePlan(state, plan.id, { confirmed: true, failAt });
    assert.equal(failed.phase, 'rolled_back');
    assert.deepEqual(failed.tasks, state.tasks);
    assert.equal(failed.executionReceipts.length, 0);
    assert.equal(failed.journal[0].type, 'rollback');
    assert.equal(failed.plans.find((item) => item.id === plan.id).baseRevision, failed.revision);
    const retried = executePlan(failed, plan.id, { confirmed: true });
    assert.equal(retried.phase, 'resolved');
    assert.equal(retried.executionReceipts.length, 1);
  }
});

test('undo restores tasks while preserving preferences changed after execution', () => {
  const state = planned();
  const applied = executePlan(state, best(state).id, { confirmed: true });
  const remembered = updatePreference(applied, 'maxExtraCost', 5);
  const undone = undoLastExecution(remembered);
  assert.deepEqual(undone.tasks, state.tasks);
  assert.equal(undone.preferences.maxExtraCost, 5);
  assert.equal(undone.phase, 'disrupted');
  assert.equal(undone.plans.length, 0);
  assert.throws(() => undoLastExecution(undone), /no applied recovery/);
});

test('scripted conversation persists real tool calls and never treats negation as approval', () => {
  let result = respond(createHousehold(), 'Alex is delayed');
  assert.equal(result.state.phase, 'planned');
  assert.deepEqual(result.trace.map((item) => item.tool), ['report_disruption', 'propose_recovery']);
  assert.deepEqual(result.trace[0].args, { scenario: 'partner-delayed' });
  for (const message of ["don't apply the plan", 'not yet, go ahead', 'yes but do not apply', 'no, apply the plan']) {
    const rejected = respond(result.state, message);
    assert.equal(rejected.state.phase, 'planned');
    assert.equal(rejected.trace.some((item) => item.tool === 'execute_recovery'), false);
  }
  result = respond(result.state, 'budget $5');
  result = respond(result.state, 'yes, apply the plan');
  assert.equal(result.state.phase, 'resolved');
  assert.equal(result.trace.at(-1).args.confirmed, true);
  assert.equal(result.state.conversation.length, 7);
  const reopened = respond(JSON.parse(JSON.stringify(result.state)), 'undo');
  assert.equal(reopened.state.phase, 'planned');
  assert.equal(reopened.state.preferences.maxExtraCost, 5);
  assert.equal(reopened.state.conversation.length, 9);
});

test('negated selected-plan commands never approve a recovery', () => {
  const state = planned();
  for (const message of ["don't apply selected plan", 'do not apply the selected plan', 'yes, but do not apply the selected plan']) {
    const result = respond(state, message);
    assert.equal(result.state.phase, 'planned');
    assert.deepEqual(result.state.tasks, state.tasks);
    assert.equal(result.trace.some((item) => item.tool === 'execute_recovery'), false);
  }
  const approved = respond(state, 'apply the recommended plan');
  assert.equal(approved.state.phase, 'resolved');
});

test('explicit host selection executes the chosen alternative rather than the ranked recommendation', () => {
  const state = planned();
  const backup = state.plans.find((plan) => plan.title.includes('trusted backup'));
  assert.notEqual(state.activePlanId, backup.id);
  const selected = { ...state, activePlanId: backup.id };
  for (const message of ['apply the plan', 'apply selected plan', 'apply the selected plan', 'yes, apply the selected plan']) {
    const result = respond(selected, message);
    assert.equal(result.state.tasks.find((task) => task.id === 'pickup').owner, 'morgan');
    assert.equal(result.trace.find((item) => item.tool === 'execute_recovery').args.planId, backup.id);
    const replay = interpretMessage(selected, message);
    assert.equal(replay.calls.find((item) => item.name === 'execute_recovery').args.planId, backup.id);
  }
});

test('dry interpretation can be replayed as exact MCP tool operations', () => {
  let state = createHousehold();
  for (const message of ['school closes early', 'under $10', 'use Morgan', 'why', 'apply the plan', 'undo']) {
    const preview = interpretMessage(state, message);
    const expected = respond(state, message);
    for (const call of preview.calls) state = runTool(state, call.name, call.args).state;
    state.conversation = preview.conversation;
    assert.deepEqual(state, expected.state);
    assert.equal(preview.reply, expected.reply);
  }
  assert.equal(state.preferences.maxExtraCost, 9.99);
});

test('review tool is read-only and execution receipts describe only actual applied changes', () => {
  const state = planned();
  const preview = runTool(state, 'confirm_recovery', { planId: best(state).id });
  assert.deepEqual(preview.state, state);
  assert.equal(preview.result.requiresConfirmation, true);
  assert.equal(state.journal.some((entry) => entry.type === 'execution'), false);
  const applied = runTool(state, 'execute_recovery', { planId: best(state).id, confirmed: true });
  assert.equal(applied.result.applied, true);
  assert.equal(applied.state.journal.filter((entry) => entry.type === 'receipt').length, best(state).changes.length);
  const replay = runTool(applied.state, 'execute_recovery', { planId: best(state).id, confirmed: true });
  assert.equal(replay.result.idempotent, true);
  assert.equal(toolDefinitions.length, 10);
  assert.throws(() => runTool(state, 'send_message'), /Unknown Relay tool/);
});

test('failure demo produces an honest rollback trace and unsupported messages explain scripted mode', () => {
  const state = planned();
  const failure = respond(state, 'test a service failure');
  assert.equal(failure.state.phase, 'rolled_back');
  assert.deepEqual(failure.state.tasks, state.tasks);
  assert.equal(failure.trace.at(-1).status, 'failed');
  const unsupported = respond(createHousehold(), 'Order me a helicopter');
  assert.match(unsupported.reply, /scripted host/);
  assert.equal(unsupported.trace.length, 0);
});

test('pickup questions read the committed assignment after execution and after undo', () => {
  const state = planned();
  const applied = executePlan(state, best(state).id, { confirmed: true });
  const reopened = undoLastExecution(applied);
  for (const message of ["Who is picking Sam up?", "Who's picking Sam up?", 'Who will collect Sam?', 'pickup status']) {
    const resolved = respond(applied, message);
    assert.match(resolved.reply, /Priya is currently assigned.*4:00 PM/);
    assert.match(resolved.reply, /recovery has been applied/);
    assert.deepEqual(resolved.trace.map((entry) => entry.tool), ['get_household']);
    assert.deepEqual(resolved.state.tasks, applied.tasks);
    assert.equal(resolved.state.revision, applied.revision);
    assert.deepEqual(resolved.state.journal, applied.journal);

    const undone = respond(reopened, message);
    assert.match(undone.reply, /Alex is currently assigned.*4:00 PM/);
    assert.match(undone.reply, /conflicts with the disruption/);
    assert.match(undone.reply, /still need explicit approval/);
    assert.deepEqual(undone.trace.map((entry) => entry.tool), ['get_household']);
    assert.deepEqual(undone.state.tasks, reopened.tasks);
    assert.equal(undone.state.revision, reopened.revision);
    assert.deepEqual(undone.state.journal, reopened.journal);
  }
});
