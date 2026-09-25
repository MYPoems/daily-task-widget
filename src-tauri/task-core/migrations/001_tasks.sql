BEGIN;

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    task_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 2),
    reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (reminder_enabled IN (0, 1)),
    reminder_time TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_date_priority ON tasks(task_date, priority DESC, created_at ASC);
CREATE INDEX idx_tasks_status ON tasks(status);
PRAGMA user_version = 1;

COMMIT;
