import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleWorker } from '../worker/index.mjs';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE relay_households(owner_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL)');
  return { close: () => db.close(), prepare: sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args), run: async () => { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; } }) }) };
}
function request(path, body, owner = 'test-owner', headers = {}) {
  return new Request('https://relay.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('hosted data requires identity; discovery does not expose private records', async () => {
  const DB = database();
  try {
    assert.equal((await handleWorker(request('/api/state', undefined, null), { DB })).status, 401);
    const response = await handleWorker(request('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null), { DB });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.result.tools.length, 10);
    assert.equal(JSON.stringify(result).includes('test-owner'), false);
    assert.equal((await handleWorker(request('/api/state', undefined, 'test-owner', { Origin: 'https://foreign.example' }), { DB })).status, 403);
  } finally { DB.close(); }
});

test('hosted MCP-backed conversation persists cumulative facts and isolates owners', async () => {
  const DB = database();
  try {
    const response = await handleWorker(request('/api/chat', { message: "Alex is delayed by 45 minutes. School closes at 3:10. Don't move my meeting. Under $10." }), { DB });
    assert.equal(response.status, 200, await response.clone().text());
    const { state, trace } = await response.json();
    assert.equal(state.members.find(member => member.id === 'alex').availableFrom, 980);
    assert.equal(state.tasks.find(task => task.id === 'meeting').flexible, false);
    assert.equal(state.preferences.maxExtraCost, 9.99);
    assert.ok(trace.some(item => item.tool === 'set_constraint' && item.protocol.includes('MCP')));
    const persisted = await (await handleWorker(request('/api/state'), { DB })).json();
    assert.deepEqual(persisted, state);
    const other = await (await handleWorker(request('/api/state', undefined, 'different-owner'), { DB })).json();
    assert.equal(other.scenario, null);
    assert.equal(other.conversation.length, 1);
    const backup = state.plans.find(plan => plan.feasible);
    const applied = await (await handleWorker(request('/api/execute', { planId: backup.id, confirmed: true }), { DB })).json();
    assert.equal(applied.phase, 'resolved');
    assert.equal(applied.tasks.find(task => task.id === 'pickup').owner, 'morgan');
  } finally { DB.close(); }
});

test('hosted persistent failure restores tasks and proposes a fresh alternative', async () => {
  const DB = database();
  try {
    const initial = await (await handleWorker(request('/api/scenario', { scenario: 'partner-delayed' }), { DB })).json();
    const response = await handleWorker(request('/api/execute', { planId: initial.activePlanId, confirmed: true, failAt: 1, adaptive: true }), { DB });
    const state = await response.json();
    assert.deepEqual(state.tasks, initial.tasks);
    assert.equal(state.phase, 'rolled_back');
    assert.notEqual(state.activePlanId, initial.activePlanId);
    assert.equal(state.plans.find(plan => plan.id === state.activePlanId).variant, 'backup');
    assert.equal((await handleWorker(request('/api/execute', { planId: initial.activePlanId, confirmed: true }), { DB })).status, 409);
  } finally { DB.close(); }
});

test('hosted calendar import validates before changing the household', async () => {
  const DB = database();
  try {
    const before = await (await handleWorker(request('/api/state'), { DB })).json();
    const result = await handleWorker(request('/api/calendar', { text: 'bad data', ownerId: 'priya' }), { DB });
    assert.equal(result.status, 409);
    const after = await (await handleWorker(request('/api/state'), { DB })).json();
    assert.deepEqual(after, before);
    assert.equal((await handleWorker(request('/api/execute', { confirmed: false, planId: 'x' }), { DB })).status, 400);
  } finally { DB.close(); }
});
