# Changelog

## v1.0.0 — 2026-09-26

- Added search across task titles, descriptions and notes, plus exact date filtering.
- Added daily and weekly repeats. Completing an occurrence creates one future task and resets its subtasks.
- Added soft deletion, an eight-second Undo action and recovery from Settings.
- Added a manual GitHub release check in Settings. The app does not check automatically.
- Extended JSON backups to include repeat metadata and deleted tasks while retaining support for version 1 backups.
- Kept all v0.2 features: local reminders and snooze, bilingual interface, task/subtask progress, priority ordering, tray controls, startup option and window preferences.
- Database migrations from versions 1–4 run automatically. Existing task IDs and data are preserved.

Windows installers are currently unsigned. The release includes a SHA-256 checksum file for verification.
