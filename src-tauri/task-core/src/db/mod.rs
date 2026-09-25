use std::{collections::HashMap, path::Path};

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Local, NaiveDateTime, SecondsFormat, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::task::{
    normalize_reminder, normalize_status, validate_date, validate_title, CreateTaskInput, Priority,
    Reminder, Status, Subtask, Task, UpdateTaskInput,
};

const TASK_COLUMNS: &str = "id, title, description, task_date, status, progress, priority, reminder_enabled, reminder_time, notes, created_at, updated_at";

pub fn initialize(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("Failed to create application data directory")?;
    }
    let conn = open(path)?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .context("Failed to read database schema version")?;
    match version {
        0 => {
            conn.execute_batch(include_str!("../../migrations/001_tasks.sql"))?;
            conn.execute_batch(include_str!("../../migrations/002_reminders.sql"))?;
            conn.execute_batch(include_str!("../../migrations/003_subtasks.sql"))?;
        }
        1 => {
            conn.execute_batch(include_str!("../../migrations/002_reminders.sql"))?;
            conn.execute_batch(include_str!("../../migrations/003_subtasks.sql"))?;
        }
        2 => conn.execute_batch(include_str!("../../migrations/003_subtasks.sql"))?,
        3 => {}
        _ => bail!("Database schema version {version} is newer than this app supports"),
    }
    Ok(())
}

fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path).context("Failed to open tasks database")?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    let status_text: String = row.get(4)?;
    let priority_number: i64 = row.get(6)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        date: row.get(3)?,
        status: Status::from_db(&status_text).ok_or(rusqlite::Error::InvalidQuery)?,
        progress: row.get(5)?,
        priority: Priority::from_db(priority_number).ok_or(rusqlite::Error::InvalidQuery)?,
        reminder: Reminder {
            enabled: row.get::<_, i64>(7)? == 1,
            time: row.get(8)?,
        },
        notes: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        subtasks: Vec::new(),
    })
}

fn attach_subtasks(conn: &Connection, tasks: &mut [Task]) -> Result<()> {
    if tasks.is_empty() { return Ok(()); }
    let indexes: HashMap<String, usize> = tasks.iter().enumerate().map(|(index, task)| (task.id.clone(), index)).collect();
    let mut statement = conn.prepare(
        "SELECT id, task_id, title, completed, created_at FROM subtasks ORDER BY created_at, id"
    )?;
    let rows = statement.query_map([], |row| Ok(Subtask {
        id: row.get(0)?, task_id: row.get(1)?, title: row.get(2)?,
        completed: row.get::<_, i64>(3)? == 1, created_at: row.get(4)?,
    }))?;
    for row in rows {
        let subtask = row?;
        if let Some(&index) = indexes.get(&subtask.task_id) { tasks[index].subtasks.push(subtask); }
    }
    Ok(())
}

pub fn create_task(path: &Path, input: CreateTaskInput) -> Result<Task> {
    let title = validate_title(&input.title)?;
    validate_date(&input.date)?;
    let reminder = normalize_reminder(input.reminder.unwrap_or_default())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let conn = open(path)?;
    conn.execute(
        "INSERT INTO tasks (id, title, description, task_date, status, progress, priority, reminder_enabled, reminder_time, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'todo', 0, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![id, title, input.description, input.date, input.priority.as_db(), reminder.enabled, reminder.time, input.notes, now],
    )
    .context("Failed to create task")?;
    get_task(path, &id)?.context("Created task could not be read back")
}

pub fn list_tasks(path: &Path, date: Option<&str>) -> Result<Vec<Task>> {
    let conn = open(path)?;
    let sql = if date.is_some() {
        format!(
            "SELECT {TASK_COLUMNS} FROM tasks WHERE task_date = ?1 ORDER BY priority DESC, task_date ASC, created_at ASC"
        )
    } else {
        format!("SELECT {TASK_COLUMNS} FROM tasks ORDER BY priority DESC, task_date ASC, created_at ASC")
    };
    let mut statement = conn.prepare(&sql).context("Failed to prepare task list")?;
    let tasks = if let Some(date) = date {
        validate_date(date)?;
        statement.query_map([date], task_from_row)?
    } else {
        statement.query_map([], task_from_row)?
    };
    let mut tasks = tasks
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read tasks")?;
    attach_subtasks(&conn, &mut tasks)?;
    Ok(tasks)
}

pub fn get_task(path: &Path, id: &str) -> Result<Option<Task>> {
    let conn = open(path)?;
    let mut task = conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"),
        [id],
        task_from_row,
    )
    .optional()
    .context("Failed to read task")?;
    if let Some(ref mut task) = task { attach_subtasks(&conn, std::slice::from_mut(task))?; }
    Ok(task)
}

pub fn update_task(path: &Path, input: UpdateTaskInput) -> Result<Task> {
    let existing = get_task(path, &input.id)?.context("Task not found")?;
    let title = validate_title(&input.title)?;
    validate_date(&input.date)?;
    let reminder = normalize_reminder(input.reminder)?;
    // An explicit undo of a completed task must leave room below 100%.
    let requested_progress =
        if existing.status == Status::Done && input.status != Status::Done && input.progress >= 100
        {
            95
        } else {
            input.progress
        };
    let (status, progress) = if existing.subtasks.is_empty() {
        normalize_status(input.status, requested_progress)
    } else {
        subtask_completion(existing.subtasks.iter().map(|item| item.completed))
    };
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let conn = open(path)?;
    conn.execute(
        "UPDATE tasks SET title = ?1, description = ?2, task_date = ?3, status = ?4,
         progress = ?5, priority = ?6, reminder_enabled = ?7, reminder_time = ?8,
         notes = ?9, updated_at = ?10,
         reminder_fired_at = CASE WHEN task_date != ?3 OR reminder_time IS NOT ?8 OR reminder_enabled != ?7 OR status = 'done' THEN NULL ELSE reminder_fired_at END,
         snooze_until = CASE WHEN task_date != ?3 OR reminder_time IS NOT ?8 OR reminder_enabled != ?7 OR status = 'done' THEN NULL ELSE snooze_until END
         WHERE id = ?11",
        params![
            title,
            input.description,
            input.date,
            status.as_db(),
            progress,
            input.priority.as_db(),
            reminder.enabled,
            reminder.time,
            input.notes,
            now,
            input.id
        ],
    )
    .context("Failed to update task")?;
    get_task(path, &input.id)?.context("Updated task could not be read back")
}

fn subtask_completion(items: impl Iterator<Item = bool>) -> (Status, i32) {
    let (total, completed) = items.fold((0, 0), |(total, completed), done| {
        (total + 1, completed + i32::from(done))
    });
    if total == 0 || completed == 0 { (Status::Todo, 0) }
    else if completed == total { (Status::Done, 100) }
    else { (Status::Doing, (completed * 100 + total / 2) / total) }
}

fn recalculate_subtasks(conn: &Connection, task_id: &str) -> Result<()> {
    let (total, completed): (i32, i32) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(completed), 0) FROM subtasks WHERE task_id = ?1",
        [task_id], |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let (status, progress) = if total == 0 { (Status::Todo, 0) }
        else if completed == total { (Status::Done, 100) }
        else if completed == 0 { (Status::Todo, 0) }
        else { (Status::Doing, (completed * 100 + total / 2) / total) };
    conn.execute(
        "UPDATE tasks SET status = ?1, progress = ?2, updated_at = ?3,
         reminder_fired_at = CASE WHEN status = 'done' AND ?1 != 'done' THEN NULL ELSE reminder_fired_at END,
         snooze_until = CASE WHEN status = 'done' AND ?1 != 'done' THEN NULL ELSE snooze_until END
         WHERE id = ?4",
        params![status.as_db(), progress, Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true), task_id],
    )?;
    Ok(())
}

pub fn add_subtask(path: &Path, task_id: &str, title: &str) -> Result<Task> {
    let title = validate_title(title)?;
    let mut conn = open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO subtasks (id, task_id, title, completed, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        params![Uuid::new_v4().to_string(), task_id, title, Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)],
    ).context("Failed to add subtask")?;
    recalculate_subtasks(&tx, task_id)?;
    tx.commit()?;
    get_task(path, task_id)?.context("Parent task not found")
}

pub fn set_subtask_completed(path: &Path, id: &str, completed: bool) -> Result<Task> {
    let mut conn = open(path)?;
    let tx = conn.transaction()?;
    let task_id: String = tx.query_row("SELECT task_id FROM subtasks WHERE id = ?1", [id], |row| row.get(0))
        .optional()?.context("Subtask not found")?;
    tx.execute("UPDATE subtasks SET completed = ?1 WHERE id = ?2", params![completed, id])?;
    recalculate_subtasks(&tx, &task_id)?;
    tx.commit()?;
    get_task(path, &task_id)?.context("Parent task not found")
}

pub fn delete_subtask(path: &Path, id: &str) -> Result<Task> {
    let mut conn = open(path)?;
    let tx = conn.transaction()?;
    let task_id: String = tx.query_row("SELECT task_id FROM subtasks WHERE id = ?1", [id], |row| row.get(0))
        .optional()?.context("Subtask not found")?;
    tx.execute("DELETE FROM subtasks WHERE id = ?1", [id])?;
    recalculate_subtasks(&tx, &task_id)?;
    tx.commit()?;
    get_task(path, &task_id)?.context("Parent task not found")
}

#[derive(Debug, Clone)]
pub struct ScheduledReminder {
    pub id: String,
    pub title: String,
    pub progress: i32,
    pub due_at: DateTime<Local>,
}

pub fn pending_reminders(path: &Path, now: DateTime<Local>) -> Result<Vec<ScheduledReminder>> {
    let conn = open(path)?;
    let mut statement = conn.prepare(
        "SELECT id, title, progress, task_date, reminder_time, snooze_until
         FROM tasks WHERE reminder_enabled = 1 AND status != 'done'
         AND reminder_fired_at IS NULL AND (task_date >= ?1 OR snooze_until IS NOT NULL)",
    )?;
    let today = now.date_naive().format("%Y-%m-%d").to_string();
    let rows = statement.query_map([today], |row| {
        Ok((
            row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)?,
            row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, Option<String>>(5)?,
        ))
    })?;
    let mut reminders = Vec::new();
    for row in rows {
        let (id, title, progress, date, time, snooze) = row?;
        let due_at = if let Some(snooze) = snooze {
            DateTime::parse_from_rfc3339(&snooze)?.with_timezone(&Local)
        } else {
            let local = NaiveDateTime::parse_from_str(&format!("{date} {time}"), "%Y-%m-%d %H:%M")?;
            Local.from_local_datetime(&local).earliest().context("Invalid local reminder time")?
        };
        reminders.push(ScheduledReminder { id, title, progress, due_at });
    }
    reminders.sort_by_key(|reminder| reminder.due_at);
    Ok(reminders)
}

pub fn claim_reminder(path: &Path, id: &str) -> Result<bool> {
    let conn = open(path)?;
    let changed = conn.execute(
        "UPDATE tasks SET reminder_fired_at = ?1, snooze_until = NULL
         WHERE id = ?2 AND reminder_enabled = 1 AND status != 'done' AND reminder_fired_at IS NULL",
        params![Utc::now().to_rfc3339(), id],
    )?;
    Ok(changed > 0)
}

pub fn release_reminder(path: &Path, id: &str) -> Result<()> {
    let conn = open(path)?;
    conn.execute(
        "UPDATE tasks SET reminder_fired_at = NULL WHERE id = ?1 AND reminder_enabled = 1 AND status != 'done'",
        [id],
    )?;
    Ok(())
}

pub fn snooze_task(path: &Path, id: &str, minutes: i64) -> Result<()> {
    if ![10, 30, 60].contains(&minutes) { bail!("Snooze must be 10, 30 or 60 minutes"); }
    let until = (Utc::now() + chrono::Duration::minutes(minutes)).to_rfc3339();
    let conn = open(path)?;
    let changed = conn.execute(
        "UPDATE tasks SET snooze_until = ?1, reminder_fired_at = NULL
         WHERE id = ?2 AND reminder_enabled = 1 AND status != 'done'",
        params![until, id],
    )?;
    if changed == 0 { bail!("Task is not eligible for snooze"); }
    Ok(())
}

pub fn delete_task(path: &Path, id: &str) -> Result<bool> {
    let conn = open(path)?;
    let changed = conn
        .execute("DELETE FROM tasks WHERE id = ?1", [id])
        .context("Failed to delete task")?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("daily-task-widget-{}.db", Uuid::new_v4()))
    }

    fn create_input(title: &str, priority: Priority) -> CreateTaskInput {
        CreateTaskInput {
            title: title.into(),
            description: None,
            date: "2026-09-24".into(),
            priority,
            reminder: None,
            notes: None,
        }
    }

    #[test]
    fn crud_and_restart_persistence() -> Result<()> {
        let path = test_path();
        initialize(&path)?;
        let created = create_task(&path, create_input("  Draft quote  ", Priority::High))?;
        assert_eq!(created.title, "Draft quote");
        assert_eq!(created.progress, 0);
        assert_eq!(get_task(&path, &created.id)?.as_ref(), Some(&created));

        let updated = update_task(
            &path,
            UpdateTaskInput {
                id: created.id.clone(),
                title: "Finish quote".into(),
                description: Some("Client project".into()),
                date: created.date.clone(),
                status: Status::Doing,
                progress: 50,
                priority: Priority::Medium,
                reminder: Reminder {
                    enabled: true,
                    time: Some("15:00".into()),
                },
                notes: Some("Confirm totals".into()),
            },
        )?;
        assert_eq!(updated.title, "Finish quote");
        assert_eq!(updated.progress, 50);
        assert_eq!(updated.notes.as_deref(), Some("Confirm totals"));

        initialize(&path)?;
        assert_eq!(
            list_tasks(&path, Some("2026-09-24"))?,
            vec![updated.clone()]
        );
        assert!(delete_task(&path, &created.id)?);
        assert!(get_task(&path, &created.id)?.is_none());
        assert!(!delete_task(&path, &created.id)?);
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[test]
    fn progress_priority_and_validation() -> Result<()> {
        let path = test_path();
        initialize(&path)?;
        assert!(create_task(&path, create_input("   ", Priority::Low)).is_err());
        let low = create_task(&path, create_input("Low", Priority::Low))?;
        let high = create_task(&path, create_input("High", Priority::High))?;
        assert_eq!(list_tasks(&path, None)?[0].id, high.id);

        let completed = update_task(
            &path,
            UpdateTaskInput {
                id: low.id.clone(),
                title: low.title.clone(),
                description: None,
                date: low.date.clone(),
                status: Status::Doing,
                progress: 120,
                priority: Priority::Low,
                reminder: Reminder::default(),
                notes: None,
            },
        )?;
        assert_eq!((completed.status, completed.progress), (Status::Done, 100));
        let undone = update_task(
            &path,
            UpdateTaskInput {
                id: low.id.clone(),
                title: low.title,
                description: None,
                date: low.date,
                status: Status::Doing,
                progress: 100,
                priority: Priority::Low,
                reminder: Reminder::default(),
                notes: None,
            },
        )?;
        assert_eq!((undone.status, undone.progress), (Status::Doing, 95));
        assert!(list_tasks(&path, Some("2026-02-30")).is_err());
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[test]
    fn reminder_claim_and_reschedule_after_migration() -> Result<()> {
        let path = test_path();
        open(&path)?.execute_batch(include_str!("../../migrations/001_tasks.sql"))?;
        initialize(&path)?;
        let mut input = create_input("Call client", Priority::High);
        input.reminder = Some(Reminder { enabled: true, time: Some("15:00".into()) });
        let task = create_task(&path, input)?;
        let now = Local.with_ymd_and_hms(2026, 9, 24, 15, 5, 0).single().unwrap();
        assert_eq!(pending_reminders(&path, now)?[0].id, task.id);
        assert!(claim_reminder(&path, &task.id)?);
        assert!(!claim_reminder(&path, &task.id)?);
        assert!(pending_reminders(&path, now)?.is_empty());
        release_reminder(&path, &task.id)?;
        assert_eq!(pending_reminders(&path, now)?.len(), 1);
        assert!(claim_reminder(&path, &task.id)?);
        update_task(&path, UpdateTaskInput {
            id: task.id.clone(), title: task.title, description: None, date: task.date,
            status: Status::Todo, progress: 0, priority: Priority::High,
            reminder: Reminder { enabled: true, time: Some("16:00".into()) }, notes: None,
        })?;
        assert_eq!(pending_reminders(&path, now)?.len(), 1);
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[test]
    fn subtasks_drive_progress_completion_and_cascade() -> Result<()> {
        let path = test_path();
        initialize(&path)?;
        let task = create_task(&path, create_input("Release", Priority::High))?;
        let first = add_subtask(&path, &task.id, "Build")?;
        assert_eq!((first.status, first.progress, first.subtasks.len()), (Status::Todo, 0, 1));
        let second = add_subtask(&path, &task.id, "Test")?;
        let third = add_subtask(&path, &task.id, "Package")?;
        assert_eq!(third.subtasks.len(), 3);
        let one = set_subtask_completed(&path, &second.subtasks[0].id, true)?;
        assert_eq!((one.status, one.progress), (Status::Doing, 33));
        let two = set_subtask_completed(&path, &second.subtasks[1].id, true)?;
        assert_eq!((two.status, two.progress), (Status::Doing, 67));
        let all = set_subtask_completed(&path, &third.subtasks[2].id, true)?;
        assert_eq!((all.status, all.progress), (Status::Done, 100));
        let parent_edit = update_task(&path, UpdateTaskInput {
            id: task.id.clone(), title: "Release v1".into(), description: None, date: task.date,
            status: Status::Todo, progress: 0, priority: Priority::High,
            reminder: Reminder::default(), notes: None,
        })?;
        assert_eq!((parent_edit.status, parent_edit.progress), (Status::Done, 100));
        let reopened = set_subtask_completed(&path, &all.subtasks[0].id, false)?;
        assert_eq!((reopened.status, reopened.progress), (Status::Doing, 67));
        delete_subtask(&path, &reopened.subtasks[0].id)?;
        let after = delete_subtask(&path, &reopened.subtasks[1].id)?;
        assert_eq!((after.status, after.progress), (Status::Done, 100));
        let empty = delete_subtask(&path, &after.subtasks[0].id)?;
        assert_eq!((empty.status, empty.progress), (Status::Todo, 0));
        assert!(delete_task(&path, &task.id)?);
        assert!(get_task(&path, &task.id)?.is_none());
        std::fs::remove_file(path)?;
        Ok(())
    }
}
