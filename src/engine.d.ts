declare module '*.mjs' {
  export function createHousehold(): unknown;
  export function applyDisruption(state: unknown, scenario: string): unknown;
  export function buildPlans(state: unknown): unknown;
  export function executePlan(state: unknown, planId: string, options?: Record<string, unknown>): unknown;
  export function undoLastExecution(state: unknown): unknown;
  export function updatePreference(state: unknown, key: string, value: unknown): unknown;
  export function respond(state: unknown, message: string): { state: unknown; reply: string; trace: unknown[] };
  export function runTool(state: unknown, name: string, args?: Record<string, unknown>): { state: unknown; result: unknown };
  export const toolDefinitions: unknown[];
  export function formatTime(minutes: number): string;
}
