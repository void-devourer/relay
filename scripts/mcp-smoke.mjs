import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import assert from 'node:assert/strict';
const url = process.env.RELAY_MCP_URL ?? 'http://127.0.0.1:4317/mcp';
const client = new Client({ name: 'relay-smoke-check', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: process.env.RELAY_API_TOKEN ? { Authorization: `Bearer ${process.env.RELAY_API_TOKEN}` } : {} } }));
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 10);
  const result = await client.callTool({ name: 'get_household', arguments: {} });
  assert.equal(result.isError ?? false, false);
  const data = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
  assert.ok(data.state.tasks.length >= 4);
  console.log(`PASS: MCP Streamable HTTP initialized, discovered ${listed.tools.length} tools, read ${data.state.tasks.length} persisted tasks.`);
} finally { await client.close(); }
