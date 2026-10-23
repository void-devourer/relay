# Relay implementation contract

## October 22 v2 additions

The upgrade prompts/plan supersede the initial fixture-reset behavior below. State schemaVersion is 2 with cumulative disruptions, blockedVariants, importedCalendar, lastFailure and optional calendarDate. report_disruption accepts exact delayMinutes, pickupTime and travelMinutes plus backup-unavailable. set_constraint enforces meeting-lock; import_calendar validates timed one-day ICS data. Persistent failures with adaptive:true restore tasks, block the failed variant and produce fresh proposals. The hosted Worker uses per-user D1 persistence and an SDK client over in-process MCP; external /mcp supports Streamable HTTP. Node keeps SQLite and HTTP MCP. Browser mode remains a development fallback. The frontend auto-detects a same-origin backend on any port and supports an explicitly configured external HTTPS/loopback origin with an in-memory token. No live Bedrock call is verified without usable credentials and model access.

Project: household plan rescue for an Alexa+ simulator, paired with a real self-hosted MCP server. All household data and external service actions are explicitly sandbox fixtures. Browser simulator and Node server use the same domain engine. No external messages, purchases, calendar writes, or bookings.

## Ownership

- Domain worker: `shared/engine.mjs`, `tests/engine.test.mjs` only.
- Frontend worker: `src/`, `index.html`, `vite.config.ts`, `tsconfig.json` only.
- Main agent: `server/`, `scripts/`, package/config files, documentation, deployment, integration tests.

## Shared engine contract (plain JS; browser safe)

Exports `createHousehold()`, `applyDisruption(state, scenario)`, `buildPlans(state)`, `executePlan(state, planId, options={})`, `undoLastExecution(state)`, `updatePreference(state, key, value)`, `respond(state, message)`, `runTool(state, name, args={})`, `toolDefinitions`, `formatTime(minutes)`.

State objects are JSON serializable. Mutators return a new state, never mutate the input. Engine throws `Error` with human-readable message and optional `.code` for invalid actions. `respond` returns `{state, reply, trace}`. `runTool` returns `{state, result}`. Trace items: `{tool, status:'complete'|'failed', summary}`. Tool definitions: `{name, description, inputSchema}` JSON Schema.

State: `{id, revision, scenario, phase, members, tasks, preferences, plans, activePlanId, journal, conversation}`.

- phase: `steady|disrupted|planned|resolved|rolled_back`
- scenario: `null|'partner-delayed'|'school-early'|'car-unavailable'`
- members: `{id, name, role, initials, color, availableFrom, availableUntil, travelMinutes, authorizedPickup, availabilityConfirmed}` array
- tasks: `{id, title, owner, start, end, location, kind, status, flexible, originalStart?}` array; owner is member id, start/end minutes after midnight; kind `work|pickup|grocery|dinner`; status `scheduled|conflict|updated`.
- preferences: `{maxExtraCost:number, preferFamily:boolean, protectDinner:boolean}`
- plans: `{id, title, subtitle, feasible, score, extraCost, changes, reasons, tradeoffs, baseRevision}` array; changes `{taskId, field, before, after, label}`; field `owner|start|end|status` only. At least 2 meaningful candidates; infeasible candidates explain why.
- journal: `{id, at, type, title, detail}` array, newest first.
- conversation: `{id, role:'assistant'|'user', text}` array.

`applyDisruption` changes relevant inputs and increments revision. Original coherent afternoon: Alex school pickup 16:00, groceries 16:25, Priya meeting 15:00-16:00, dinner 18:30. Delayed Alex becomes unavailable for pickup; school-early deadline 15:10; car-unavailable increases Alex travel minutes. Morgan is trusted backup with fixture-confirmed permission and availability. All scenarios must produce concrete different plans using availability/travel/budget constraints. Plan preferred family uses Priya moving a flexible meeting, alternative uses Morgan with demonstrated consent. Grocery task can move later; dinner protected where enabled.

`buildPlans` returns new state with phase planned and plans generated from current constraints. Plans baseRevision match resulting state.revision. `executePlan` validates plan feasible, fresh revision, explicit `options.confirmed===true`; options `{confirmed, failAt?:number}`. Failure injected at change index must restore all tasks atomically, record rollback, keep a retryable plan with correct revision. Success applies all task changes, increments revision, invalidates other plans, journal receipts, phase resolved. Repeated same execution never applies changes twice. Undo restores tasks and reopens the disruption, invalidates plans. Preference update invalidates/recalculates proposals, increments revision.

`respond` handles supported seeded natural-language intents: delay/school closes early/car unavailable; show plan; budget ('under $10', 'budget $5'); prefer family ('keep it in the family'); why explain; approval ('apply the plan','go ahead','yes') (exact explicit approval, negations never approve); undo; summary/status; failure demo ('test a service failure') generates failure on approved demo workflow. Unsupported input explains supported workflow honestly. Model mode optional Bedrock; replay mode labeled scripted, no fake LLM claims. Keep conversation persisted, record actual engine tool traces.

Tools: `get_household`, `report_disruption` scenario enum, `propose_recovery`, `set_preference` key enum/value, `confirm_recovery` planId (read-only creates approval description), `execute_recovery` planId/confirmed boolean, `undo_recovery`, `get_journal`. Never approve through a hidden LLM flag; backend execution authority only originates from explicit UI confirmation or explicit authenticated MCP caller's confirmed field.

## Browser API adapter

Use `src/api.ts` to export `loadState`, `sendMessage`, `chooseScenario`, `approvePlan`, `undoPlan`, `setPreference`, `resetDemo`, `testFailure`. On localhost port 4317 use real server API; other hosts/Vite use localStorage backed shared engine. Expose mode `Local MCP + SQLite` or `Browser sandbox · scripted host`. `/api/state` -> state, `/api/chat` POST `{message}` -> `{state,reply,trace}`, `/api/scenario` POST `{scenario}` -> state after apply+build, `/api/execute` POST `{planId,confirmed:true,failAt?}` -> state, `/api/undo` POST -> state, `/api/preferences` POST `{key,value}` -> state, `/api/reset` POST -> state. Errors `{error}` with proper status. Frontend chooses current plan and offers explicit review/apply, never silently executes on disruption.

## UX

Warm off-white canvas, dark navy sidebar/voice pane, mint/teal accent, amber conflict markers. Custom inline/CSS relationship view or schedule timeline; no stock art needed. Polished responsive dashboard with Today / Recovery / Memory / Activity views, visible sandbox labels, three scenario chips, household cards, timeline, alternatives with cost/change count, before/after preview, confirmation, active tool trace, failure+undo controls. Voice input via browser SpeechRecognition with typed fallback and speech output toggle. Accessible loading/errors and keyboard controls. Show actual engine results. Seeded date October 15, 2026 labeled demo day.
