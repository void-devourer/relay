import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

describe('Relay real HTTP and SQLite integration', { concurrency: false }, () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const port = 15000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const token = 'relay-integration-test-token-123456789';
  let directory;
  let child;
  let output = '';
  let client;
  async function start() {
    child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), RELAY_DB_PATH: join(directory, 'test.sqlite'), RELAY_API_TOKEN: token, RELAY_AGENT_MODE: 'scripted', RELAY_ALLOWED_ORIGINS: 'https://relay.example' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try { const response = await fetch(`${base}/api/health`, { headers: { Authorization: `Bearer ${token}` } }); if (response.ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Server did not become ready: ${output}`);
  }
  async function stop() {
    if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
  async function request(path, data = undefined) {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json();
    return { response, result };
  }
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'relay-integration-'));
    await start();
    client = new Client({ name: 'relay-integration', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  });
  after(async () => {
    await client?.close(); await stop();
    if (directory) {
      assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
      assert.ok(basename(directory).startsWith('relay-integration-'));
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('negotiates MCP 2025-11-25 and discovers real tools', async () => {
    const response = await fetch(base + '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result.protocolVersion, '2025-11-25');
    assert.equal((await client.listTools()).tools.length, 10);
  });
  it('blocks unauthenticated access, foreign origins, invalid bodies and unknown tools', async () => {
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request('/api/chat', { message: '' })).response.status, 400);
    const result = await client.callTool({ name: 'report_disruption', arguments: { scenario: 'made-up' } });
    assert.equal(result.isError, true);
  });
  it('allows only the explicitly configured frontend origin and supports token preflight', async () => {
    const headers = { Authorization: `Bearer ${token}`, Origin: 'https://relay.example' };
    const allowed = await fetch(base + '/api/meta', { headers });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://relay.example');
    const preflight = await fetch(base + '/api/state', { method: 'OPTIONS', headers: { Origin: 'https://relay.example', 'Access-Control-Request-Headers': 'authorization, content-type' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    assert.equal((await fetch(base + '/api/state', { headers: { ...headers, Origin: 'https://relay.example.evil.test' } })).status, 403);
  });
  it('runs scripted conversations through actual MCP without prematurely executing', async () => {
    await request('/api/reset', {});
    const { response, result } = await request('/api/chat', { message: 'Alex is delayed. Help me fix the afternoon.' });
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.state.phase, 'planned');
    assert.ok(result.state.plans.some(plan => plan.feasible));
    assert.ok(result.trace.some(item => item.tool === 'report_disruption' && item.protocol === 'MCP · Streamable HTTP'));
    assert.ok(result.trace.some(item => item.tool === 'propose_recovery'));
    assert.ok(result.state.conversation.some(item => item.role === 'user'));
  });
  it('requires explicit approval, atomically compensates failure, retries, and undoes', async () => {
    const initial = (await request('/api/state')).result;
    const plan = initial.plans.find(item => item.feasible);
    assert.equal((await request('/api/execute', { planId: plan.id, confirmed: false })).response.status, 400);
    const { result: failed } = await request('/api/execute', { planId: plan.id, confirmed: true, failAt: 1 });
    assert.equal(failed.phase, 'rolled_back');
    assert.deepEqual(failed.tasks, initial.tasks);
    const retry = failed.plans.find(item => item.feasible);
    const { result: applied } = await request('/api/execute', { planId: retry.id, confirmed: true });
    assert.equal(applied.phase, 'resolved');
    assert.notDeepEqual(applied.tasks, initial.tasks);
    const { result: undone } = await request('/api/undo', {});
    assert.deepEqual(undone.tasks, initial.tasks);
  });
  it('invalidates a plan when preferences change', async () => {
    const { result: state } = await request('/api/scenario', { scenario: 'school-early' });
    const plan = state.plans.find(item => item.feasible);
    await request('/api/preferences', { key: 'maxExtraCost', value: 5 });
    const response = await request('/api/execute', { planId: plan.id, confirmed: true });
    assert.equal(response.response.status, 409);
  });
  it('executes the failure demo through MCP instead of claiming a dry-preview rollback', async () => {
    await request('/api/scenario', { scenario: 'partner-delayed' });
    const previous = (await request('/api/state')).result;
    const { response, result } = await request('/api/chat', { message: 'test a service failure' });
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.state.phase, 'rolled_back');
    assert.deepEqual(result.state.tasks, previous.tasks);
    assert.ok(result.trace.some(item => item.tool === 'execute_recovery' && item.status === 'failed'));
    assert.ok(result.state.journal.length > previous.journal.length);
  });
  it('binds explicit chat approval to the alternative actually selected in the interface', async () => {
    await request('/api/reset', {});
    await request('/api/preferences', { key: 'maxExtraCost', value: 20 });
    const { result: state } = await request('/api/scenario', { scenario: 'partner-delayed' });
    const alternative = state.plans.find(plan => plan.feasible && plan.id !== state.activePlanId);
    assert.ok(alternative);
    const { response, result } = await request('/api/chat', { message: 'apply the plan', planId: alternative.id });
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.state.phase, 'resolved');
    assert.equal(result.state.lastExecution.planId, alternative.id);
    assert.equal(result.state.tasks.find(task => task.id === 'pickup').owner, 'morgan');
  });
  it('enforces cumulative exact constraints through MCP and imports a real calendar payload', async () => {
    await request('/api/reset', {});
    const message = "Alex is delayed by 45 minutes. School closes at 3:10. Don't move my client call. Keep spending under $10.";
    const { response, result } = await request('/api/chat', { message });
    assert.equal(response.status, 200);
    assert.equal(result.state.tasks.find(task => task.id === 'meeting').flexible, false);
    assert.equal(result.state.members.find(person => person.id === 'alex').availableFrom, 980);
    assert.equal(result.state.plans.filter(plan => plan.feasible).length, 1);
    const unavailability = await request('/api/scenario', { scenario: 'backup-unavailable' });
    assert.equal(unavailability.result.plans.filter(plan => plan.feasible).length, 0);
    assert.equal(unavailability.result.preferences.maxExtraCost, 9.99);
    const text = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261015T143000\nDTEND:20261015T163000\nSUMMARY:Imported presentation\nEND:VEVENT\nEND:VCALENDAR';
    const imported = await request('/api/calendar', { text, ownerId: 'priya' });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.result.tasks.find(task => task.id === 'meeting').title, 'Imported presentation');
  });
  it('persists household preferences and conversation after a process restart', async () => {
    const previous = (await request('/api/state')).result;
    await client.close();
    await stop();
    await start();
    const current = (await request('/api/state')).result;
    assert.equal(current.revision, previous.revision);
    assert.deepEqual(current.preferences, previous.preferences);
    assert.deepEqual(current.conversation, previous.conversation);
    assert.deepEqual(current.tasks, previous.tasks);
  });
  it('connects its internal MCP host when bound to IPv6 loopback', async () => {
    const ipv6Port = port + 1;
    const ipv6 = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, HOST: '::1', PORT: String(ipv6Port), RELAY_DB_PATH: join(directory, 'ipv6.sqlite'), RELAY_API_TOKEN: token, RELAY_AGENT_MODE: 'scripted' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    ipv6.stdout.on('data', chunk => { logs += chunk; });
    ipv6.stderr.on('data', chunk => { logs += chunk; });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (ipv6.exitCode !== null) throw new Error(logs);
        try { ready = (await fetch(`http://[::1]:${ipv6Port}/api/health`, { headers: { Authorization: `Bearer ${token}` } })).ok; } catch {}
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(ready, true, logs);
    } finally {
      if (ipv6.exitCode === null) await new Promise(resolve => { ipv6.once('exit', resolve); ipv6.kill(); });
    }
  });
});
