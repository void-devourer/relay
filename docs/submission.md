# Relay submission draft

This draft separates the product story from evidence to collect. Replace bracketed fields with verified repository, hosted-demo, and video URLs before submission.

## Devpost copy

**Title:** Relay — rescue the afternoon.

**Tagline:** When one plan changes, repair the whole afternoon with one reviewed decision.

**Problem:** A delayed partner or early school closing changes more than pickup. Work, travel, groceries, and dinner depend on the original plan. Parents must rediscover those dependencies and coordinate a replacement while already busy.

**Solution:** Relay turns a spoken or typed disruption into constraint-checked alternatives. It explains who can cover pickup, which commitments must move, what the recovery costs, and what stays protected. The user reviews a before/after schedule and approves the selected proposal. Receipts, persistent preferences, a failure demonstration, and undo make the result inspectable.

**What we built:** A responsive Alexa+ simulator backed by per-user hosted D1 storage, with a separately runnable Node/SQLite server. Both use the same domain engine and official MCP SDK. Ten tools expose household state, cumulative parameterized disruptions, hard meeting constraints, ICS import, proposals, preferences, review, execution, undo and receipts. The public MCP endpoint uses Streamable HTTP 2025-11-25. The hosted web host uses SDK in-process MCP; Node uses actual HTTP MCP. Typecheck, production build, and 41 tests pass, covering the engine, HTTP transport, restart persistence and a D1 test adapter. Real cloud deployment verification is distinct from those local tests.

**Why it is distinctive:** Relay repairs several connected commitments while respecting travel, confirmed caregiver availability, budget, and protected dinner. Proposals bind to current household state. The failure demonstration restores sandbox tasks instead of reporting partial success. The interaction exposes the decision and its consequences before execution.

**Honest boundaries:** This is an Alexa+ experience simulator, not a live Alexa+ integration. Household service actions are simulated; imported calendar input is read-only at its source. Default conversation uses a labeled rules host with compound constraints. A persistent failure blocks the failed workflow and rechecks alternatives after task rollback. Optional Bedrock is unverified because the SDK found no usable credentials or configured model. The hosted D1 household and Node SQLite household are separate. External backend connection tokens stay in page memory.

**Links:** Repository [URL]; private hosted simulator [URL and access instructions]; video [YouTube/Vimeo URL]; local setup and MCP testing [README link].

## Demo script — target 2:45

| Time | Action | What the viewer should see |
| --- | --- | --- |
| 0:00–0:15 | Introduce the original afternoon and visible sandbox mode | Pickup, groceries, work, and dinner form one connected plan |
| 0:15–0:35 | Say/type “Alex is delayed. Help rescue the afternoon.” | Changed availability, actual tool traces, and a pickup conflict |
| 0:35–1:00 | Open Recovery and compare alternatives | A family plan and trusted-backup plan; cost and constraint reasons |
| 1:00–1:20 | Review the before/after schedule and approve the plan | Explicit consent precedes task changes; receipts follow success |
| 1:20–1:35 | Reload, then open Memory/Activity or ask for the current plan | Committed state and saved preferences survive the refresh |
| 1:35–2:05 | Reset, choose early school closing, and demonstrate service failure | An injected sandbox failure restores tasks and records rollback |
| 2:05–2:25 | Retry the reviewed plan, then demonstrate undo | Recovery succeeds; undo visibly restores the prior schedule |
| 2:25–2:45 | Show MCP client smoke output and explain the boundary | Real transport/tools; simulated household services and Alexa+ host |

Record working interactions, not a click-through mockup. Use typed input if voice recognition is unavailable. Show the server mode when demonstrating SQLite/MCP; a static browser refresh proves only browser-local persistence. Trim footage to stay below three minutes.

## Eligibility and route evidence

The Alexa+ route accepts a working Agent Skill or self-hosted MCP server using spec 2025-11-25 or later over Streamable HTTP. It also accepts a simulated Alexa+ experience built with an AI or agentic tool. Relay supplies both the simulator source and the separately runnable MCP implementation. [Official rules](https://amazonappdev2026.devpost.com/rules)

Submission needs a working project, a GitHub repository with source/setup instructions and appropriate access/license, a functioning demonstration video under three minutes, and product feedback. Keep the project available to judges for the evaluation period. [Official rules](https://amazonappdev2026.devpost.com/rules)

Submission closes October 24, 2026 at 00:30 IST, corresponding to October 23 at noon PDT. [Official rules](https://amazonappdev2026.devpost.com/rules)

Alexa+ preview tools are not required for this simulator approach. Consult the [official FAQ](https://amazonappdev2026.devpost.com/details/faqs) for current track guidance. Verify negotiated protocol with the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Product feedback and friction log

Report only tools actually used. Keep observed experience separate from proposed improvement. Bedrock and cloud deployment belong under unverified until a live run supplies evidence.

| Tool/service | Actual use | Observed result | Improvement or unverified item |
| --- | --- | --- | --- |
| MCP SDK | [Actual import, server entry point, client tool invocation] | [Command/date/result] | [Observed friction or “none observed”] |
| MCP Streamable HTTP | [Negotiated version and endpoint] | [Smoke output or concrete failure] | [Reproduction and workaround] |
| Browser speech APIs | [Browser/version; input/output used] | [Permission/support behavior actually seen] | [Unsupported browsers not tested] |
| Node built-in SQLite | [Actual persistent state path/use] | [Restart/refresh result] | [Limits encountered] |
| Private Site hosting | [Actual deployed browser simulator] | [Deployment/access behavior] | [Limits observed] |
| Amazon Bedrock, if tested | [Model/region and actual MCP loop] | [Tool call evidence] | Otherwise: unconfigured and unverified |

For each actual tool, answer: purpose; setup/onboarding experience; what worked; concrete problems; whether we would build with it again and why. A friction entry should include task, expected behavior, actual behavior, reproduction, severity, workaround, and proposed fix. Record no invented onboarding problems, timings, API failures, or AWS usage.

## Evidence checklist

- [x] Typecheck and production build passed; all 41 tests passed; read-only MCP smoke discovered ten tools and read persisted tasks.
- [x] MCP initialization negotiated 2025-11-25; integration tests exercised actual HTTP tool invocation.
- [ ] Inspect both server mode and hosted browser sandbox; describe their separate persistence.
- [x] Local browser QA exercised explicit approval, injected rollback, retry, applied-state refresh and grounded pickup status; integration tests cover undo.
- [ ] Include GitHub access, setup instructions, and the appropriate license.
- [ ] Provide hosted-demo access instructions and a public video under three minutes.
- [ ] Replace draft claims with observed results; retain limitations for untested paths.
- [ ] Complete feedback for tools actually used; add reproducible friction only where observed.
- [ ] Claim the AWS mini challenge only with documented qualifying usage and evidence.
