BEGIN;
ALTER TABLE tasks ADD COLUMN reminder_fired_at TEXT;
ALTER TABLE tasks ADD COLUMN snooze_until TEXT;
CREATE INDEX idx_tasks_reminder ON tasks(reminder_enabled, task_date, reminder_fired_at);
PRAGMA user_version = 2;
COMMIT;
