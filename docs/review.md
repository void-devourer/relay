# Relay Stage 3 review

Reviewed the shared engine, server, persistence, MCP host, tests, and implementation contract. Findings below describe concrete defects identified during this build; fixed status and final validation are reported by the coordinating agent. Frontend styling was reviewed separately by that agent.

## Defects corrected

| Priority | Finding and source | Correction |
| --- | --- | --- |
| P1 | server/host.mjs skipped trace items marked failed. The expected rollback trace from “test a service failure” was therefore never executed through MCP, although the preview reply claimed tasks had rolled back. | Execute the intended failure operation through MCP; regression coverage checks actual persisted rollback from /api/chat. |
| P1 | A browser-selected alternative could differ from the engine's recommended active proposal. Scripted “apply the selected plan” could consequently target a different option than the one reviewed. | Bind explicit approval to the reviewed selection, with the relevant proposal/revision rather than ambiguous selection language. |
| P2 | Historical execution receipts could be replayed after later household changes, producing an idempotent response unrelated to the current afternoon. | Reject inappropriate historical receipt replay; retain valid immediate duplicate protection. |
| P2 | shared/engine.mjs advertised a budget maximum of 1,000 while server/index.mjs and server/mcp.mjs validated a maximum of 100. The same budget worked in the browser and failed through the server. | Align budget constraints across the domain, API, MCP schema, and tests. |
| P2 | “Who is picking Sam up?” was documented as a useful persisted-state query but matched no supported scripted intent. | Add a grounded read-only pickup query. |
| P2 | server/store.mjs retained audit_events across reset while deterministic engine event IDs restarted. INSERT OR IGNORE could preserve earlier records and discard different new events with reused IDs. | Reset the household audit records and snapshot together in one SQLite transaction. |
| P2 | IPv6-only HOST=::1 accepted configuration, but the internal MCP client targeted IPv4 127.0.0.1. | Derive the internal MCP URL from the actual bound listener address; verify IPv6 loopback startup in integration coverage. |

## Final verification and limits

The coordinating agent verified 28 passing tests, typecheck, and production build, plus a browser workflow covering rollback, retry, apply, reload, grounded pickup queries, changed-budget feasibility, and narrow-screen layout. The final integration test verifies IPv6-only startup. The reviewer inspected source and test coverage. An isolated additional HTTP reproduction could not run inside the sandbox because loopback networking was blocked; its escalation was interrupted. No uncompleted reproduction is counted as a passed check.

No remaining blocker was identified for the documented local demonstrator. The coordinating agent corrected the additional IPv6 listener mismatch before final source packaging.

Authenticated remote browser access requires the documented reverse proxy. Household service actions remain sandbox operations, and Alexa+ remains a simulator. Optional Bedrock/AWS execution has not been verified with credentials; the review does not establish AWS mini-challenge completion or a live Alexa+ connection.
