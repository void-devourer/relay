import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, handleMcp } from '../server/mcp.mjs';
import { createHousehold, migrateHousehold, respond } from '../shared/engine.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const copy = value => JSON.parse(JSON.stringify(value));
const routes = { '/api/scenario': 'report_disruption', '/api/preferences': 'set_preference', '/api/constraint': 'set_constraint', '/api/calendar': 'import_calendar', '/api/execute': 'execute_recovery', '/api/undo': 'undo_recovery' };
const metadata = { mode: 'scripted', model: null, storage: 'Hosted D1 database', transport: 'MCP', protocol: '2025-11-25', sandbox: true, provider: 'rules', mcpEndpoint: '/mcp' };

export async function handleWorker(request, env, assets = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/mcp') {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    const asset = assets[url.pathname] ?? (!url.pathname.split('/').at(-1).includes('.') ? assets['/index.html'] : undefined);
    return asset ? new Response(request.method === 'HEAD' ? null : asset.body, { headers: { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public,max-age=86400,immutable' : 'no-cache' } }) : json({ error: 'Not found.' }, 404);
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  if (request.method === 'GET' && url.pathname === '/api/meta') return json(metadata);
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: Boolean(env.DB), sandbox: true }, env.DB ? 200 : 503);
  let data = {};
  if (request.method === 'POST') {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415);
    // Read the stream with a hard cap; Content-Length is not trusted.
    const reader = request.body?.getReader(); let size = 0; const chunks = [];
    if (reader) for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 65536) { await reader.cancel(); return json({ error: 'Request exceeds 64 KB.' }, 413); } chunks.push(next.value); }
    const bytes = new Uint8Array(size); let cursor = 0; for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
    try { data = JSON.parse(new TextDecoder().decode(bytes) || '{}'); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Use a JSON object.' }, 400);
  }
  const discovery = url.pathname === '/mcp' && ['initialize', 'notifications/initialized', 'server/discover', 'tools/list'].includes(data.method);
  if (data.method === 'server/discover' && url.pathname === '/mcp') return json({ jsonrpc: '2.0', id: data.id, result: { supportedVersions: ['2025-11-25'], capabilities: { tools: {} } } });
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner && !discovery) return json({ error: 'Sign in to this private Site to use household data.' }, 401);
  if (!env.DB && !discovery) return json({ error: 'Hosted database binding is unavailable.' }, 503);
  try {
    let previous;
    if (owner && env.DB) {
      const row = await env.DB.prepare('SELECT snapshot, revision FROM relay_households WHERE owner_id = ?').bind(owner).first();
      if (!row) {
        const initial = createHousehold();
        await env.DB.prepare('INSERT INTO relay_households (owner_id, revision, snapshot) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO NOTHING').bind(owner, initial.revision, JSON.stringify(initial)).run();
        previous = await env.DB.prepare('SELECT snapshot, revision FROM relay_households WHERE owner_id = ?').bind(owner).first();
      } else previous = row;
    }
    let state = previous ? migrateHousehold(JSON.parse(previous.snapshot)) : createHousehold();
    const store = { load: () => copy(state), save: value => { state = copy(value); return state; } };
    let response;
    if (url.pathname === '/mcp') {
      response = await handleMcp(new Request(request.url, { method: request.method, headers: request.headers, body: request.method === 'POST' ? JSON.stringify(data) : undefined }), store);
    } else if (url.pathname === '/api/state' && request.method === 'GET') response = json(state);
    else if (request.method !== 'POST') response = json({ error: 'Method not allowed.' }, 405);
    else {
      // The web host uses an SDK MCP client. Public /mcp exposes Streamable HTTP;
      // in-process transport avoids an authenticated HTTP request back to this Worker.
      const server = createMcpServer(store);
      const client = new Client({ name: 'relay-hosted-web-host', version: '0.2.0' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const trace = [];
      const call = async (name, args = {}) => {
        const output = await client.callTool({ name, arguments: args });
        if (output.isError) throw new Error(output.content.find(item => item.type === 'text')?.text ?? 'Tool failed.');
        const result = output.structuredContent;
        trace.push({ tool: name, args, status: result?.state?.phase === 'rolled_back' && name === 'execute_recovery' ? 'failed' : 'complete', summary: `Verified ${name} through the MCP SDK.`, protocol: 'MCP · in-process transport' });
        return result;
      };
      try {
        if (url.pathname === '/api/chat') {
          if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 2000) return json({ error: 'Enter a message of 1–2000 characters.' }, 400);
          if (data.planId && !state.plans.some(plan => plan.id === data.planId && plan.baseRevision === state.revision)) return json({ error: 'The selected proposal is stale.' }, 409);
          const preview = respond(data.planId ? { ...state, activePlanId: data.planId } : state, data.message);
          for (const item of preview.trace) await call(item.tool, item.args ?? {});
          state.conversation = preview.state.conversation;
          response = json({ state, reply: preview.reply, trace });
        } else if (url.pathname === '/api/reset') { state = createHousehold(); response = json(state); }
        else if (routes[url.pathname]) {
          if (url.pathname === '/api/execute' && data.confirmed !== true) return json({ error: 'Explicit approval required.' }, 400);
          await call(routes[url.pathname], data);
          if (url.pathname === '/api/scenario') await call('propose_recovery');
          response = json(state);
        } else response = json({ error: 'Unknown endpoint.' }, 404);
      } finally { await client.close(); await server.close(); }
    }
    if (previous && JSON.stringify(state) !== previous.snapshot) {
      // CAS protects concurrent tabs and MCP callers, including conversations/reset.
      const saved = copy(state);
      saved.revision = Math.max(saved.revision, previous.revision + 1);
      if (saved.revision !== state.revision && saved.plans.length) saved.plans = saved.plans.map(plan => ({ ...plan, baseRevision: saved.revision }));
      const write = await env.DB.prepare('UPDATE relay_households SET revision = ?, snapshot = ? WHERE owner_id = ? AND revision = ?').bind(saved.revision, JSON.stringify(saved), owner, previous.revision).run();
      if (write.meta.changes !== 1) return json({ error: 'The household changed in another tab. Refresh and review again.' }, 409);
      // Responses must contain the persisted revision, never an earlier snapshot.
      if (url.pathname.startsWith('/api/')) {
        const payload = await response.json();
        return json(url.pathname === '/api/chat' ? { ...payload, state: saved } : response.ok ? saved : payload, response.status);
      }
    }
    return response;
  } catch (error) { return json({ error: error.message }, 409); }
}

export default { fetch: (request, env) => handleWorker(request, env, RELAY_ASSETS) };
