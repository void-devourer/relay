# Relay architecture and acceptance contract

Relay repairs a household afternoon when one commitment changes. It compares feasible alternatives, explains their consequences, and applies a reviewed plan to sandbox services. The demonstration date is October 15, 2026; household identities, schedules, caregiver permissions, and service responses are seeded fixtures.

## Requirements

| ID | Required behavior | Acceptance evidence |
| --- | --- | --- |
| R1 | Support partner delayed, school early, and car unavailable | Each scenario changes the relevant inputs and produces a distinct recovery |
| R2 | Validate availability, travel, caregiver authorization/confirmed availability, and budget | Infeasible alternatives explain the failed constraint |
| R3 | Preserve dinner when the preference is enabled | Generated changes respect that constraint |
| R4 | Compare meaningful alternatives | Review shows changed commitments, extra cost, reasons, and tradeoffs |
| R5 | Require explicit approval of a current proposal | Unconfirmed and stale execution fail without applying tasks |
| R6 | Apply sandbox changes once | Repeating an execution cannot duplicate changes |
| R7 | Restore tasks after injected service failure | Failure leaves no partial task changes and records rollback |
| R8 | Persist preferences, conversation, and receipts; support undo | Refresh/restart restores state; undo reopens the disruption |
| R9 | Share domain behavior between browser and server | Both adapters call the same engine |
| R10 | Expose real MCP independently of the simulator | An MCP client initializes, lists tools, and invokes them over Streamable HTTP |

## Components and decisions

| Component | Responsibility | Decision |
| --- | --- | --- |
| React interface | Timeline, alternatives, review, voice/text, memory, activity | Warm off-white/navy/teal interface; typed fallback for voice |
| Browser adapter | Static hosted demonstration | localStorage plus the shared engine; visibly scripted sandbox mode |
| Shared engine | Constraints, ranking, revisions, task mutations, conversation intents | Plain browser-safe JavaScript; immutable JSON state |
| Node HTTP API | Persistent local application | Same-origin browser API; Node 24 deployment target |
| SQLite store | Household state and recoverable history | One local household; persist the full serializable state |
| MCP endpoint | Tool schema and execution surface | Official SDK; Streamable HTTP; negotiate 2025-11-25 or later |
| Optional Bedrock host | Model-driven explanation/tool selection | Converse with actual MCP client calls; requires credentials and live verification |

The default conversational host recognizes supported seeded intents. It is a scripted agent host, not a claim of open-ended language understanding. Feasibility remains deterministic in either host mode. Browser speech recognition and speech synthesis depend on browser support and permissions.

## State and database

The authoritative shape is in CONTRACT.md. A household snapshot contains a revision, scenario, phase, members, tasks, preferences, proposals, active plan, journal, and conversation. Plans carry a base revision and explicit changes to task fields. Confirmed caregiver availability comes from fixtures, rather than an inference from a calendar gap.

SQLite uses household_state(id TEXT primary key, revision INTEGER, snapshot TEXT) and audit_events(id TEXT primary key, household_id TEXT, revision INTEGER, record TEXT). snapshot and record contain serialized JSON. The snapshot holds complete current state; audit records preserve the journal history independently. Writes use a SQLite transaction with an expected-revision check. The default file is data/relay.sqlite, configurable with RELAY_DB_PATH.

Browser mode persists a separate snapshot in the current browser's localStorage. These modes do not synchronize. This is a single-household demonstrator, not a tenancy or account system. Preserve the SQLite data directory across server restarts and deployments; an ephemeral filesystem loses the server demonstration state.

Build, preference changes, disruptions, execution, and undo follow the engine's revision rules. A proposal becomes invalid when its inputs change. Before execution, validate freshness, feasibility, and explicit approval. The engine applies the sandbox task changes as one operation; an injected failure restores their original values and leaves a receipt. This models failure recovery inside the sandbox, not durable compensation across independent production services.

## HTTP API

The API contract is intentionally small; responses are state snapshots unless noted.

| Method/path | Input | Result |
| --- | --- | --- |
| GET /api/state | None | Current state |
| POST /api/chat | message | state, reply, trace |
| POST /api/scenario | scenario | Disruption plus generated plans |
| POST /api/execute | planId, confirmed: true, optional failAt | Executed or rolled-back state |
| POST /api/undo | None | Restored tasks with invalidated proposals |
| POST /api/preferences | key, value | Updated preference and revised proposals |
| POST /api/reset | None | Original fixture |

Invalid input produces an appropriate HTTP error with an error message. Execution is a mutation: reporting a disruption or reviewing a proposal does not authorize it. The API adapter selects server mode at localhost port 4317 and local browser mode for the static simulation.

## MCP and approval

Tools: get_household, report_disruption, propose_recovery, set_preference, confirm_recovery, execute_recovery, undo_recovery, and get_journal. Tool schemas validate inputs; mutation delegates to the same domain engine. confirm_recovery prepares a human-readable description. execute_recovery requires the explicit confirmed argument and a valid current proposal.

The Bedrock host receives read, proposal, and preference tools; its model tool loop does not expose execute or undo. Execution and undo route from supported explicit user intents or UI requests. A tool result or model sentence cannot create user authorization. An authenticated external MCP caller is responsible for establishing its user's approval before supplying confirmed: true; the demonstrator is not a general authorization protocol for third-party calendars or bookings.

Streamable HTTP security includes Host/Origin validation, local loopback binding, a 64 KB request body limit, and authenticated access when exposed remotely. RELAY_API_TOKEN is optional on loopback and mandatory on non-loopback interfaces. Protocol negotiation must be checked with an MCP client; an SDK import or README version string is insufficient evidence. See the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Deployment boundaries

The private hosted Site serves the static browser simulation. Its local actions update browser state; it does not run the Node server, expose a public MCP endpoint, or contact family services. The self-hosted path runs Node with a persistent SQLite volume and serves the application/API/MCP endpoint. A remote MCP deployment additionally needs HTTPS, origin configuration, access control, and a verified reachable endpoint.

Configuration: PORT defaults to 4317; HOST defaults to 127.0.0.1; RELAY_DB_PATH selects storage; RELAY_API_TOKEN protects remote requests; RELAY_PUBLIC_ORIGIN sets the remote allowed Origin; RELAY_AGENT_MODE selects scripted or bedrock. Bedrock additionally uses AWS_REGION, BEDROCK_MODEL_ID, and server-side AWS credentials. The environment example and setup instructions are the authority if names change.

Keep AWS credentials and access tokens on the server. Bedrock configuration and AWS deployment require available credentials, a permitted model, and recorded live testing before an AWS integration claim. The AWS mini challenge is not established by untested optional code.

Future production work includes household membership and consent, provider OAuth, real provider adapters, concurrency across workers, durable job/compensation records, provider idempotency, backups, telemetry, data retention, and independent security review. These are explicit deployment prerequisites, not features attributed to the demonstrator.

## Verification scope

Run the package verification command and MCP smoke script, then inspect the browser recovery flow. Cover approval rejection, stale proposals, scenario differences, travel and caregiver constraints, budget updates, duplicate execution, failure at multiple change positions, undo, and persistence. Check desktop/narrow layouts, keyboard confirmation, useful errors, and unavailable/denied microphone fallback.

Record results only after commands or interactions finish. Distinguish engine/API/MCP tests from browser inspection. Optional Bedrock, real Alexa+, external household providers, cloud hosting, and multi-household production remain unverified unless their own evidence is recorded.
