# Daily Task Widget implementation status

## First usable version

- Tauri 2 window with a custom draggable header, rounded transparent surface, narrow scrollbars, icon, tray menu and Ctrl+Alt+T quick add.
- React/TypeScript Today list, quick add, task details, completed section, bilingual UI, appearance and startup settings.
- SQLite task and subtask storage. The schema migrates in order from version 1 to 3. With subtasks, completion and progress are derived from checked children; without subtasks, task completion and progress remain manual.
- Event-driven reminder worker in Rust, Windows notifications, and 10/30/60 minute snooze. Windows notifications require the app to be running and notifications enabled.
- Task-core database tests and a frontend production build.

## v0.1.1: tasks across dates

- The task store loads all dates. The Today summary and completed area still count only today's tasks.
- A compact Other dates entry opens overdue, upcoming and completed history sections. Overdue tasks can move to today in one click; all listed tasks remain editable.
- Verified the Windows release window with tasks dated yesterday, today and tomorrow, including the move action, bilingual labels and return navigation. All QA records were removed afterward.

## v0.2.0: reliability, backup, release automation

- The single-instance plugin focuses the existing widget on repeat launch. When revealed or focused, a window stranded outside all current displays is centered on a visible monitor.
- The reminder worker rechecks the wall clock at least once per minute, including after sleep, instead of waiting indefinitely for a previously computed deadline.
- Settings can export a versioned JSON backup of tasks, subtasks and reminder state, or merge it into the current database. Import validates the entire file first and commits atomically; existing task IDs are skipped.
- A Windows GitHub Actions workflow validates frontend and database code on main/PR pushes. Version tags build an NSIS installer and publish it with SHA256SUMS.txt.

## Delivery checks

- Build a Windows NSIS installer and inspect the resulting artifact.
- Verify fresh launch, migration, CRUD, child completion, tray, shortcut, appearance, reminder, and close-to-tray behavior on the native window.
- Confirm window position restoration and no off-screen placement after a display configuration change.

The product scope comes from the user-provided project specification. No account, cloud sync, telemetry, tags or recurring-task system is included.
