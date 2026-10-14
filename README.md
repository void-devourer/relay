# Relay

**The day doesn't go to plan. Your household still can.**

Relay is a household recovery agent for the Amazon Developer Hackathon Alexa+ track. Say “Alex is delayed” and Relay checks school pickup, caregiver permission, travel time, calendars, groceries, budget, and dinner. It compares three concrete alternatives, explains why one fails, and presents exact changes before you approve them.

The working project includes a voice-enabled Alexa+ web simulator, a real self-hosted MCP server, persistent SQLite state, explicit approval, execution receipts, injected failure with atomic rollback, and undo. All people and household services are **sandbox fixtures**. This is not connected to live Alexa+, calendars, schools, or grocery services.

## Run the complete project

Use **Node.js 24** (Node 22.13+ supports the SQLite API; Node 24 is tested).

```powershell
cd "C:\Users\Piyush Kumar\Documents\ChatGPT\amazon alexa hackathon\relay"
npm ci
npm run build
npm start
```

Open **http://localhost:4317**. The app uses the real MCP HTTP host and stores household state in `data/relay.sqlite`. No API key is needed for scripted demo mode. Speech recognition depends on browser support and microphone permission; typing and scenario buttons always work. Voice transcripts are handled by the browser's speech service when supported.

For frontend development, `npm run dev` serves the browser sandbox at the Vite URL. This mode uses the **same engine** with local storage and does not connect to MCP. The private hosted Site also uses this browser sandbox. The interface labels the mode.

## Try the demonstration

1. Select **Alex is delayed**, or type “Alex is delayed. Help me fix the afternoon.”
2. Compare the family and trusted-backup options; inspect the rejected “Wait for Alex” option.
3. Review precise before/after changes. Approve the family option to apply sandbox changes.
4. Undo, review the plan again, and use the service-failure test. All partial task changes must roll back.
5. Retry after reviewing the current proposal, refresh, and ask “Who is picking Sam up?”
6. Change the budget or family preference in Memory and inspect the recalculated proposals.

The seeded demo date is **October 15, 2026**. Scripted mode handles the documented afternoon scenarios, budget/family/dinner preferences, proposal explanation, explicit approval, undo, and status. It is an intent parser, not a language model.

## MCP integration

`http://localhost:4317/mcp` uses the official MCP TypeScript SDK and **Streamable HTTP**, negotiating **2025-11-25**. The transport is stateless; household state persists independently in SQLite.

Tools: `get_household`, `report_disruption`, `propose_recovery`, `set_preference`, `confirm_recovery`, `execute_recovery`, `undo_recovery`, `get_journal`.

The local web host discovers these tools and actually calls them through the SDK's HTTP client. A plan is versioned against the household revision. `execute_recovery` requires a current feasible plan and `confirmed: true`. Changes to preferences invalidate the previous proposal. Confirmation data must come from an explicit trusted caller; a general autonomous model must not invent it.

```powershell
npm run mcp:smoke
```

This read-only smoke check connects, discovers tools, and reads persisted tasks. MCP clients can configure a Streamable HTTP server with the above URL. With `RELAY_API_TOKEN` set, include `Authorization: Bearer <your token>`.

## Optional Amazon Bedrock host

Copy `.env.example` to `.env`, configure your AWS credentials using the standard AWS credential chain, and set:

```dotenv
RELAY_AGENT_MODE=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=your-enabled-converse-model-or-inference-profile-id
```

Run `node --env-file=.env server/index.mjs`. The server uses Bedrock Converse, discovers MCP tools, performs a bounded tool loop, and supplies actual tool results back to the model. Execution and undo tools are excluded from the model's callable tools. Explicit approval stays in the interface or the deterministic intent parser.

**Live AWS calls have not been verified without credentials.** Bedrock failures return an error; Relay does not silently pretend that a model ran. Costs and model access are controlled by your AWS account. The AWS mini-challenge claim requires demonstrating the configured live integration.

## Verification

```powershell
npm run check
npm test
npm run build
```

Tests cover availability, travel, permission, budget, immutable state, approval, stale plans, idempotency, all partial-change failure points, undo, protocol negotiation, authentication, cross-origin rejection, actual HTTP tool calls, and restart persistence. Local HTTP tests need loopback networking.

## Deployment and boundaries

- The hosted Site is a private static browser simulator. It does not host the Node MCP server, share SQLite state, or call AWS.
- Self-host the Node service with a persistent disk. It binds to loopback by default. Non-loopback binding requires a bearer token of at least 24 characters. Use TLS via a private reverse proxy and configure `RELAY_PUBLIC_ORIGIN` to its origin. The current server is deliberately **one sandbox household**, not a multi-user product.
- Setting `RELAY_API_TOKEN` protects API/MCP calls. The UI has no token-entry screen; for a private remotely served UI, use an authenticated reverse proxy that injects the backend token. Never put that token into the frontend bundle.
- The included Dockerfile is a packaging recipe; a cloud deployment and Docker build are not claimed as verified. Supply `RELAY_API_TOKEN`, an allowed public origin, and a persistent volume for `/app/data` when using it.
- Rollback is atomic for fixture state. Real calendar or commerce integrations require idempotent service adapters, compensation semantics, account linking, and ongoing permission checks. A local SQLite transaction cannot roll back an external service.
- Candidate generation enumerates three workflow templates and filters/ranks them using explicit constraints and a disclosed heuristic. It is not a general optimization solver.

## Project map

```text
src/                    React simulator and API/browser adapter
shared/engine.mjs       Constraint validation, proposals, transitions, scripted intents
server/index.mjs        HTTP API, origin/auth checks, static serving
server/mcp.mjs          Real MCP tool server
server/host.mjs         Scripted MCP client and optional Bedrock host
server/store.mjs        SQLite snapshots and audit events
tests/                  Domain and real HTTP integration tests
docs/prompts.md         Three prompts derived from the supplied compiler
docs/architecture.md    Scope, decisions, data model and acceptance criteria
docs/submission.md      Devpost draft, demo script and feedback log
docs/review.md          Review findings and verification notes
```

MIT licensed. The official [hackathon rules](https://amazonappdev2026.devpost.com/rules) and [Alexa+ access FAQ](https://amazonappdev2026.devpost.com/details/faqs) define submission requirements. A repository URL, functioning demo video, and product feedback still need to be submitted by the entrant.
