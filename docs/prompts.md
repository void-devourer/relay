PROMPT 1 → PLAN

Act as a principal engineer and product designer. Plan Relay: an Alexa+ household plan rescue experience for the Amazon Developer Hackathon. A parent reports a delayed partner, early school closing, or unavailable car; Relay identifies conflicts, compares feasible recovery plans, requests explicit approval, applies sandbox changes, and preserves an audit trail. Optimize for a convincing three-minute demonstration and a small, complete implementation.

Read CONTRACT.md, package.json, and existing source before planning. Treat CONTRACT.md as the interface authority. Produce a concise blueprint covering requirements, acceptance criteria, architecture, folder ownership, database, HTTP APIs, MCP tools, development sequence, deployment, and risks. Infer reversible implementation choices; ask only for genuine blockers.

Use React/TypeScript/Vite for the responsive interface, a browser-safe shared domain engine, Node 24 with built-in SQLite for the persistent server, and the official MCP SDK over Streamable HTTP with protocol version 2025-11-25 or later. The hosted browser simulation runs that same engine with localStorage; distinguish it visibly from the persistent Node/MCP mode. Optional Amazon Bedrock Converse must use an actual MCP client/tool loop and remain optional without credentials.

Specify deterministic feasibility checks for availability, travel time, authorized and fixture-confirmed caregiver consent, budget, and protected dinner. Compare at least two meaningful alternatives; explain infeasible options. Bind each proposal to a state revision. Execution requires explicit confirmation, rejects stale plans, prevents duplicate changes, and restores all sandbox tasks on an injected failure. Undo and preference changes invalidate proposals.

Design Today, Recovery, Memory, and Activity views, a schedule, before/after review, cost/tradeoff cards, actual tool traces, voice input with typed fallback, and speech output controls. All household data and calendar, pickup, grocery, and dinner operations are labeled sandbox fixtures. Include loopback binding, Origin validation, input limits, validation, safe errors, and deployment authentication. Separate the demonstrator from future multi-household OAuth integrations and durable external compensation.

Completion: every requirement has an acceptance check, each component has one owner, and the blueprint identifies what can be demonstrated locally versus what needs credentials or a verified deployment. Planning ends with an executable build sequence; implementation belongs to the next prompt.

PROMPT 2 → BUILD

Implement the approved Relay blueprint and CONTRACT.md in the existing project. Produce working source and setup documentation, not another architecture proposal. Inspect current files, respect assigned ownership, and accommodate concurrent edits. Use the package scripts as the authoritative build/check/test commands.

Build three connected surfaces: the shared immutable domain engine, a polished responsive React interface, and a self-hosted Node server with SQLite persistence, HTTP APIs, and real MCP Streamable HTTP tools. The static browser sandbox uses the same engine locally; display the active mode and scripted-host label. Seed the coherent October 15, 2026 afternoon described in CONTRACT.md. Implement all three disruption scenarios, constraint-aware alternatives, preference memory, explicit plan review/approval, journal receipts, rollback, undo, and persistent conversation.

Implement get_household, report_disruption, propose_recovery, set_preference, confirm_recovery, execute_recovery, undo_recovery, and get_journal with validated schemas. confirm_recovery describes the requested changes; execution authority comes from explicit user confirmation or the authenticated MCP caller's confirmed field. An optional Bedrock host may propose and explain through real MCP calls; it cannot grant itself approval. Preserve the deterministic engine's final authority over feasibility and mutations.

Implement accessible loading/error states, keyboard interactions, household cards, the timeline, ranked alternatives, before/after preview, activity, actual tool traces, failure demonstration, and undo. Support browser voice recognition when available and typed input everywhere. Ensure unsupported conversational requests are explained honestly instead of fabricating actions.

Validate HTTP bodies and MCP arguments, reject unsupported scenarios and preferences, validate Origin, protect remote access with documented authentication, keep credentials server-side, and persist only intended state. Produce a reproducible run path and an MCP client smoke script that asserts negotiated protocol 2025-11-25 or later and invokes tools. Add meaningful engine and integration checks for feasibility, consent, stale revision rejection, explicit approval, negated approval, duplicate execution, rollback, undo, persistence, and transport.

Completion: run the project's verification scripts and MCP smoke check, repair failures, exercise the complete recovery flow in the browser, and report exact results. Label Bedrock/cloud behavior unverified unless credentials and deployment were actually exercised. Deliver setup, deployment boundaries, and a demo script; publishing and external account changes require their applicable authorization.

PROMPT 3 → OPTIMIZE

Audit the implemented Relay project against CONTRACT.md and the approved acceptance criteria. Read source and run the applicable checks. Trace the complete workflow from disruption through proposal, explicit approval, execution, persistence, failure rollback, retry, and undo. Fix substantive issues and rerun checks affected by each fix.

Review feasibility under changed travel, expired availability, unavailable or unauthorized caregivers, budget boundaries, protected dinner, and overlapping work. Verify proposal revision handling, idempotency, immutable input state, atomic sandbox rollback, persisted receipts, and recovery after refresh/server restart. Verify unsupported language and negated approval cannot execute a plan. Exercise the failure at multiple change positions rather than only at the first action.

Review authentication, Origin checks, request-size limits, schema validation, error disclosures, secret handling, and MCP version negotiation. Ensure browser simulation, direct HTTP operations, and real MCP behavior are accurately labeled. Inspect the optional Bedrock tool loop for bounded rounds, tool errors, cancellation, and independent approval enforcement. Treat unconfigured cloud paths as unverified.

Inspect the browser at desktop and narrow widths for readability, keyboard focus, useful empty/error/loading states, contrast, voice-denied fallback, and a clear confirmation preview. Improve performance and module seams only where evidence reveals a problem. Keep the one-household demonstrator understandable; document scalability and external-service gaps rather than disguising them.

Check setup instructions from a clean install, package scripts, persistent storage configuration, deployment authentication, and the under-three-minute demo. Verify submission statements against functioning code and recorded observations. Record actual tool friction with reproduction steps; identify untested claims explicitly.

Completion: deliver the repaired implementation, commands and browser flows actually checked, remaining material limitations, and an evidence-based readiness verdict distinguishing local demonstrator, hosted simulation, self-hosted MCP, and optional cloud mode. Claim production readiness only if its stated prerequisites and checks are satisfied.
