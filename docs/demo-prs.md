# Demo PRs

Real public PRs where PR Lens flags something a reviewer should look at.

| PR | What it catches |
|---|---|
| [discourse/discourse#29187](https://github.com/discourse/discourse/pull/29187) | Post-deploy migration that drops the users table's password columns (line 6) and whose `down` raises `IrreversibleMigration` (line 10). No rollback. |
| [discourse/discourse#28119](https://github.com/discourse/discourse/pull/28119) | New table migration with `remove_column` / `drop_table` (lines 38, 43), plus a change to how API keys load the current user (`lib/auth/...`). 17 files, good for showing jump-to-line far down the page. |

Known noise: #28119's drops are in the migration's `down` method, the rollback path, where dropping is expected. Rules can't tell `up` from `down`; the LLM step should.
