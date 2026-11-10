# Working on Pulse

- The team keeps its decisions and plans in Living Brain (MCP server `livingbrain`, brain "Pulse team").
  Search it before you plan or change how something works, and follow what was decided there.
- Pulse is a small app. Keep changes focused on the task and covered by tests (`npm test`).
  Run `npm run typecheck` before you finish.
- Keep scratch work (plans, notes, review write-ups, patches) out of the repo.
- When the work is done, commit it on a new branch, push, and open a pull request with `gh pr create`
  that links the related issue. Don't push to `main`.
