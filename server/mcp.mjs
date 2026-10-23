import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { runTool, toolDefinitions } from '../shared/engine.mjs';

const empty = z.object({}).strict();
const schemas = {
  get_household: empty,
  report_disruption: z.object({ scenario: z.enum(['partner-delayed', 'school-early', 'car-unavailable', 'backup-unavailable']), delayMinutes: z.number().int().min(0).max(480).optional(), pickupTime: z.number().int().min(840).max(1200).optional(), travelMinutes: z.number().int().min(1).max(180).optional() }).strict(),
  set_constraint: z.object({ kind: z.literal('meeting-lock'), taskId: z.string().min(1).max(120).optional(), value: z.boolean() }).strict(),
  import_calendar: z.object({ text: z.string().max(50000), ownerId: z.enum(['alex', 'priya']), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict(),
  propose_recovery: empty,
  set_preference: z.object({ key: z.enum(['maxExtraCost', 'preferFamily', 'protectDinner']), value: z.union([z.boolean(), z.number().min(0).max(100)]) }).strict(),
  confirm_recovery: z.object({ planId: z.string().min(1).max(120) }).strict(),
  execute_recovery: z.object({ planId: z.string().min(1).max(120), confirmed: z.boolean(), failAt: z.number().int().min(0).max(50).optional(), adaptive: z.boolean().optional() }).strict(),
  undo_recovery: empty,
  get_journal: empty,
};

export function createMcpServer(store) {
  const server = new Server({ name: 'relay-household-agent', version: '0.1.0' }, { capabilities: { tools: {} }, instructions: 'Relay manages one sandbox household. All services and people are fictional. Inspect current state, propose precise changes, ask for explicit approval, then call execute_recovery with the chosen current plan ID. Never infer caregiver consent or report completion before execution receipts. MCP 2025-11-25 Streamable HTTP.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions.map(tool => ({ ...tool, annotations: { readOnlyHint: ['get_household', 'confirm_recovery', 'get_journal'].includes(tool.name), destructiveHint: false, openWorldHint: false } })) }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const schema = schemas[params.name];
      if (!schema) throw new Error('Unknown Relay tool.');
      const args = schema.parse(params.arguments ?? {});
      const previous = store.load();
      const outcome = runTool(previous, params.name, args);
      if (JSON.stringify(outcome.state) !== JSON.stringify(previous)) store.save(outcome.state, previous.revision);
      const data = { state: outcome.state, result: outcome.result };
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof z.ZodError ? 'Invalid tool arguments. Check the tool schema.' : error.message }] };
    }
  });
  return server;
}

export async function handleMcp(request, store) {
  const server = createMcpServer(store);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
