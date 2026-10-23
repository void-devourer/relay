import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { openStore } from './store.mjs';
import { handleMcp } from './mcp.mjs';
import { createHost } from './host.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT ?? 4317);
const bind = process.env.HOST ?? '127.0.0.1';
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(bind);
const token = process.env.RELAY_API_TOKEN ?? '';
const publicOrigin = process.env.RELAY_PUBLIC_ORIGIN;
if (!loopback && token.length < 24) throw new Error('Non-loopback hosting requires RELAY_API_TOKEN with at least 24 characters.');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const mode = process.env.RELAY_AGENT_MODE ?? 'scripted';
if (!['scripted', 'bedrock'].includes(mode)) throw new Error('RELAY_AGENT_MODE must be scripted or bedrock.');
if (mode === 'bedrock' && !process.env.BEDROCK_MODEL_ID) throw new Error('Set BEDROCK_MODEL_ID to an accessible Converse model to enable Bedrock.');
const store = openStore(resolve(root, process.env.RELAY_DB_PATH ?? 'data/relay.sqlite'));
const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]);
if (publicOrigin) origins.add(new URL(publicOrigin).origin);
const hosts = new Set([...origins].map(origin => new URL(origin).host));
for (const origin of (process.env.RELAY_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)) origins.add(new URL(origin.trim()).origin);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const messageSchema = z.object({ message: z.string().trim().min(1).max(2000), planId: z.string().min(1).max(120).optional() }).strict();
const scenarioSchema = z.object({ scenario: z.enum(['partner-delayed', 'school-early', 'car-unavailable', 'backup-unavailable']), delayMinutes: z.number().int().min(0).max(480).optional(), pickupTime: z.number().int().min(840).max(1200).optional(), travelMinutes: z.number().int().min(1).max(180).optional() }).strict();
const executeSchema = z.object({ planId: z.string().min(1).max(120), confirmed: z.literal(true), failAt: z.number().int().min(0).max(50).optional(), adaptive: z.boolean().optional() }).strict();
const preferenceSchema = z.object({ key: z.enum(['maxExtraCost', 'preferFamily', 'protectDinner']), value: z.union([z.boolean(), z.number().min(0).max(100)]) }).strict();
let host;
let chatQueue = Promise.resolve();

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw Object.assign(new Error('Use application/json.'), { status: 415 });
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 65536) throw Object.assign(new Error('Request exceeds 64 KB.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON body.'), { status: 400 }); }
}
function authorized(req) {
  if (!token) return true;
  const supplied = Buffer.from(String(req.headers.authorization ?? ''));
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function call(name, args = {}) {
  if (!host) throw Object.assign(new Error('MCP host is connecting. Try again in a moment.'), { status: 503 });
  return (await host.call(name, args)).state;
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*; frame-ancestors 'self'");
  try {
    if (!hosts.has(req.headers.host)) return json(res, 403, { error: 'Unrecognized host.' });
    if (req.headers.origin && !origins.has(req.headers.origin)) return json(res, 403, { error: 'Cross-origin requests are not allowed.' });
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/') || url.pathname === '/mcp') {
      if (!authorized(req)) return json(res, 401, { error: 'Bearer authentication required.' });
      if (url.pathname === '/mcp') {
        if (!['POST', 'GET', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
        const parsed = req.method === 'POST' ? await body(req) : undefined;
        const headers = new Headers(Object.entries(req.headers).filter(([, value]) => typeof value === 'string'));
        const request = new Request(url, { method: req.method, headers, body: parsed === undefined ? undefined : JSON.stringify(parsed) });
        const response = await handleMcp(request, store);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, store.load());
      if (req.method === 'GET' && url.pathname === '/api/meta') return json(res, 200, { mode, model: process.env.BEDROCK_MODEL_ID ?? null, storage: 'SQLite', transport: 'Streamable HTTP', protocol: '2025-11-25', sandbox: true });
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, host ? 200 : 503, { ok: Boolean(host), sandbox: true });
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      const data = await body(req);
      if (url.pathname === '/api/chat') {
        const { message, planId } = messageSchema.parse(data);
        const task = chatQueue.then(() => {
          if (!host) throw Object.assign(new Error('MCP host is connecting.'), { status: 503 });
          return host.chat(store, message, planId);
        });
        chatQueue = task.catch(() => {});
        return json(res, 200, await task);
      }
      if (url.pathname === '/api/scenario') {
        const args = scenarioSchema.parse(data);
        await call('report_disruption', args);
        return json(res, 200, await call('propose_recovery'));
      }
      if (url.pathname === '/api/execute') return json(res, 200, await call('execute_recovery', executeSchema.parse(data)));
      if (url.pathname === '/api/constraint') return json(res, 200, await call('set_constraint', z.object({ kind: z.literal('meeting-lock'), taskId: z.string().max(120).optional(), value: z.boolean() }).strict().parse(data)));
      if (url.pathname === '/api/calendar') return json(res, 200, await call('import_calendar', z.object({ text: z.string().max(50000), ownerId: z.enum(['alex', 'priya']), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict().parse(data)));
      if (url.pathname === '/api/undo') return json(res, 200, await call('undo_recovery'));
      if (url.pathname === '/api/preferences') return json(res, 200, await call('set_preference', preferenceSchema.parse(data)));
      if (url.pathname === '/api/reset') return json(res, 200, store.reset());
      return json(res, 404, { error: 'Unknown API endpoint.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    const dist = resolve(root, 'dist');
    let filename = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (filename !== dist && !filename.startsWith(dist + sep)) return json(res, 403, { error: 'Invalid path.' });
    try { if ((await stat(filename)).isDirectory()) filename = resolve(filename, 'index.html'); }
    catch { if (!extname(url.pathname)) filename = resolve(dist, 'index.html'); }
    try {
      const file = await readFile(filename);
      res.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch { json(res, 404, { error: 'Build the web app with npm run build first.' }); }
  } catch (error) {
    const status = error.status ?? (error instanceof z.ZodError || error.code === 'INVALID_ARGUMENT' ? 400 : 409);
    json(res, status, { error: error instanceof z.ZodError ? 'Invalid request. Review the required fields.' : error.message });
  }
});
server.listen(port, bind, async () => {
  try {
    const address = server.address().address;
    const internalHost = address.includes(':') ? '[::1]' : address === '0.0.0.0' ? '127.0.0.1' : address;
    const internalOrigin = `http://${internalHost}:${port}`;
    origins.add(internalOrigin);
    hosts.add(new URL(internalOrigin).host);
    host = await createHost(`${internalOrigin}/mcp`, token, mode, process.env.BEDROCK_MODEL_ID ?? null, process.env.AWS_REGION ?? 'us-east-1');
    console.log(`Relay ready: http://localhost:${port} | MCP: /mcp | ${mode} host | SQLite sandbox`);
  } catch (error) { console.error('MCP host startup failed:', error.message); server.close(); store.close(); process.exitCode = 1; }
});
server.on('error', error => { console.error(error.message); store.close(); process.exitCode = 1; });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await host?.close();
  server.close(() => { store.close(); process.exit(0); });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
