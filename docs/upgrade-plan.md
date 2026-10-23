# Relay upgrade acceptance plan

1. Preserve current state; add schema version 2, cumulative facts, precise parameters and hard constraints. Verify compound requests and a second disruption never erase a prior event or imported task.
2. Model persistent failure as a blocked workflow plus task compensation, then generate fresh proposal IDs. Verify old approvals fail and another candidate or no-solution explanation is shown.
3. Import bounded, single-day timed ICS commitments into the actual planner after preview and explicit import. Reject unsupported recurrence and invalid inputs before changing state.
4. Replace the port-4317 frontend assumption with explicit connected mode and same-origin auto-detection. Use in-memory bearer credentials, exact configured origins and no silent fallback. Keep AWS tools server-only and disclose actual readiness.
5. Review, run domain/HTTP/MCP tests, typecheck/build and browser QA. Update the existing private Site, maintaining the same audience. Live AWS verification is blocked until a usable credential profile exists; the supplied display name and alias do not configure SDK authentication.
