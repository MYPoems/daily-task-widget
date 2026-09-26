BEGIN;
ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly'));
ALTER TABLE tasks ADD COLUMN parent_occurrence_id TEXT;
CREATE UNIQUE INDEX idx_tasks_parent_occurrence ON tasks(parent_occurrence_id) WHERE parent_occurrence_id IS NOT NULL;
CREATE INDEX idx_tasks_recurrence ON tasks(recurrence, task_date);
PRAGMA user_version = 5;
COMMIT;
