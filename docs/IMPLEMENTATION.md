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

## Delivery checks

- Build a Windows NSIS installer and inspect the resulting artifact.
- Verify fresh launch, migration, CRUD, child completion, tray, shortcut, appearance, reminder, and close-to-tray behavior on the native window.
- Confirm window position restoration and no off-screen placement after a display configuration change.

The product scope comes from the user-provided project specification. No account, cloud sync, telemetry, tags or recurring-task system is included.
