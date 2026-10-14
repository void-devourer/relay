import { createHousehold, runTool, respond, executePlan } from '../shared/engine.mjs';

export interface Member { id: string; name: string; role: string; initials: string; color: string; availableFrom: number; availableUntil: number; travelMinutes: number; authorizedPickup: boolean; availabilityConfirmed: boolean }
export interface Task { id: string; title: string; owner: string; start: number; end: number; location: string; kind: 'work' | 'pickup' | 'grocery' | 'dinner'; status: string; flexible: boolean; originalStart?: number }
export interface Change { taskId: string; field: 'owner' | 'start' | 'end' | 'status'; before: string | number; after: string | number; label: string }
export interface Plan { id: string; title: string; subtitle: string; feasible: boolean; score: number; extraCost: number; changes: Change[]; reasons: string[]; tradeoffs: string[]; baseRevision: number }
export interface Preferences { maxExtraCost: number; preferFamily: boolean; protectDinner: boolean }
export interface State { id: string; revision: number; scenario: string | null; phase: string; members: Member[]; tasks: Task[]; preferences: Preferences; plans: Plan[]; activePlanId: string | null; journal: { id: string; at: string; type: string; title: string; detail: string }[]; conversation: { id: string; role: string; text: string }[] }
export interface Trace { tool: string; status: 'complete' | 'failed'; summary: string }
export interface Action { state: State; reply?: string; trace: Trace[] }
export interface Meta { mode: 'scripted' | 'bedrock'; model: string | null; storage: string; transport: string; protocol: string; sandbox: boolean }

const server = window.location.port === '4317';
const storageKey = 'relay.household.v1';
let memoryState: State | undefined;
export const connectionLabel = server ? 'Local MCP + SQLite' : 'Browser sandbox · scripted host';

function isState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  return s.id === 'relay-demo-household' && Number.isInteger(s.revision) && Array.isArray((value as Record<string, unknown>).executionReceipts) && Array.isArray(s.members) && Array.isArray(s.tasks) &&
    Array.isArray(s.plans) && Array.isArray(s.journal) && Array.isArray(s.conversation) &&
    !!s.preferences && typeof s.preferences.maxExtraCost === 'number' && typeof s.preferences.preferFamily === 'boolean' && typeof s.preferences.protectDinner === 'boolean' &&
    s.members.every(m => typeof m.id === 'string' && typeof m.name === 'string' && Number.isFinite(m.availableFrom) && Number.isFinite(m.travelMinutes)) &&
    s.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string' && Number.isFinite(t.start) && Number.isFinite(t.end)) &&
    s.plans.every(p => typeof p.id === 'string' && Array.isArray(p.changes) && Array.isArray(p.reasons) && Array.isArray(p.tradeoffs) && Number.isFinite(p.baseRevision)) &&
    s.conversation.every(c => typeof c.id === 'string' && typeof c.text === 'string') &&
    s.journal.every(j => typeof j.id === 'string' && typeof j.title === 'string' && typeof j.detail === 'string');
}

function remember(state: State): State {
  memoryState = state;
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* In-memory mode still works when storage is unavailable. */ }
  return state;
}
function localState(): State {
  if (memoryState) return memoryState;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) { const state: unknown = JSON.parse(saved); if (isState(state)) return memoryState = state; }
  } catch { /* Discard malformed or inaccessible persisted demo data. */ }
  return remember(createHousehold() as State);
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Relay could not finish that action. Please try again.');
  return data as T;
}
function tool(state: State, name: string, args: Record<string, unknown> = {}): State {
  return runTool(state, name, args).state as State;
}
function trace(toolName: string, summary: string, failed = false): Trace { return { tool: toolName, summary, status: failed ? 'failed' : 'complete' }; }
export async function loadState(): Promise<State> { return server ? request<State>('/api/state') : localState(); }
export async function loadMeta(): Promise<Meta> {
  return server ? request<Meta>('/api/meta') : { mode: 'scripted', model: null, storage: 'Browser local storage', transport: 'In-process sandbox', protocol: '2025-11-25', sandbox: true };
}
export async function sendMessage(message: string, planId?: string): Promise<Action> {
  if (server) return request<Action>('/api/chat', { message, ...(planId ? { planId } : {}) });
  let current = localState();
  if (planId) {
    const plan = current.plans.find(candidate => candidate.id === planId);
    if (!plan?.feasible || plan.baseRevision !== current.revision) throw new Error('That proposal is no longer available. Review a fresh recovery option.');
    current = { ...current, activePlanId: planId };
  }
  const answer = respond(current, message) as { state: State; reply: string; trace: Trace[] };
  return { ...answer, state: remember(answer.state) };
}
export async function chooseScenario(scenario: string): Promise<Action> {
  const state = server ? await request<State>('/api/scenario', { scenario }) : remember(tool(tool(localState(), 'report_disruption', { scenario }), 'propose_recovery'));
  return { state, trace: [trace('report_disruption', 'Updated household availability and constraints.'), trace('propose_recovery', `Compared ${state.plans.length} recovery options.`)] };
}
export async function approvePlan(planId: string): Promise<Action> {
  const state = server ? await request<State>('/api/execute', { planId, confirmed: true }) : remember(tool(localState(), 'execute_recovery', { planId, confirmed: true }));
  const rolledBack = state.phase === 'rolled_back';
  return { state, trace: [trace('execute_recovery', rolledBack ? 'The service failed. All schedule changes were restored together.' : 'Applied the plan you explicitly approved. Sandbox receipts saved.', rolledBack)] };
}
export async function undoPlan(): Promise<Action> {
  const state = server ? await request<State>('/api/undo', {}) : remember(tool(localState(), 'undo_recovery'));
  return { state, trace: [trace('undo_recovery', 'Restored the previous schedule and reopened the disruption.')] };
}
export async function setPreference(key: keyof Preferences, value: number | boolean): Promise<Action> {
  const state = server ? await request<State>('/api/preferences', { key, value }) : remember(tool(localState(), 'set_preference', { key, value }));
  return { state, trace: [trace('set_preference', 'Saved this household preference and refreshed affected proposals.')] };
}
export async function resetDemo(): Promise<Action> {
  const state = server ? await request<State>('/api/reset', {}) : remember(createHousehold() as State);
  return { state, trace: [] };
}
export async function testFailure(planId: string): Promise<Action> {
  const state = server ? await request<State>('/api/execute', { planId, confirmed: true, failAt: 1 }) : remember(executePlan(localState(), planId, { confirmed: true, failAt: 1 }) as State);
  return { state, trace: [trace('execute_recovery', 'Injected a sandbox service failure. All schedule changes were rolled back.', true)] };
}
