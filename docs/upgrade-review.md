# Upgrade verification

Verified domain invariants: cumulative changes, exact times, hard meeting locks, calendar conflicts, safe no-solution outcomes, stale approvals, idempotency, transient compensation and persistent failure alternatives. Existing task assignments are retained when a new fact arrives.

Verified transport and storage: actual Node HTTP/MCP calls and restart persistence; exact-origin CORS and token preflight; hosted SDK client/tool calls with a SQLite-backed D1 test adapter; per-owner isolation, unauthenticated data rejection and malformed calendar rejection. Hosted tests do not by themselves prove deployment or the real D1 binding.

The AWS SDK credential chain and the standard local `.aws` files were checked without displaying keys. No usable default credentials or model configuration exist. The supplied display name and alias are not credential configuration. Live Bedrock execution is not counted as verified. `scripts/aws-readiness.mjs --probe` is provided for a configured account and makes a small real model call.

Local verification: 41 tests, TypeScript and production Worker build passed. A real HTTP MCP smoke check discovered all ten tools on port 4320. Browser QA exercised the compound request, preserved facts after Morgan became unavailable, and previewed/imported the sample ICS into the visible timeline. Review corrected a misleading no-solution status, blocked-option rationale, imported work availability semantics and a failure-test index assumption.

Cloud deployment and browser evidence will be reported separately from these local checks. All actual household service writes remain simulated; uploaded calendar files only supply constraints and are never written back to a source service.
