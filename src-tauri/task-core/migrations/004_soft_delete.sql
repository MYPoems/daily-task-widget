BEGIN;
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_tasks_deleted_date ON tasks(deleted_at, task_date);
PRAGMA user_version = 4;
COMMIT;
