declare module '*.mjs' {
  export function createHousehold(): unknown;
  export function migrateHousehold(state: unknown): unknown;
  export function previewCalendar(text: string, ownerId?: string, day?:string): {day:string;ownerId:string;events:{title:string;start:number;end:number}[];skipped:number};
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
