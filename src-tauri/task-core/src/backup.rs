use std::{collections::HashSet, path::Path};

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{
    db,
    task::{normalize_reminder, normalize_status, validate_date, validate_title, Status, Task},
};

const FORMAT: &str = "daily-task-widget-backup";
const MAX_BACKUP_BYTES: u64 = 50 * 1024 * 1024;

fn ensure_json_path(path: &Path) -> Result<()> {
    if !path.extension().and_then(|part| part.to_str()).is_some_and(|part| part.eq_ignore_ascii_case("json")) {
        bail!("Choose a .json backup file");
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: String,
    format_version: u32,
    exported_at: String,
    tasks: Vec<BackupTask>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupTask {
    #[serde(flatten)]
    task: Task,
    reminder_fired_at: Option<String>,
    snooze_until: Option<String>,
    #[serde(default)]
    parent_occurrence_id: Option<String>,
    #[serde(default)]
    deleted_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported: usize,
    pub skipped: usize,
}

pub fn export(path: &Path, destination: &Path) -> Result<usize> {
    ensure_json_path(destination)?;
    let mut tasks = db::list_tasks(path, None)?;
    tasks.extend(db::list_deleted_tasks(path)?);
    let conn = Connection::open(path)?;
    let mut reminder_state = conn.prepare("SELECT reminder_fired_at, snooze_until, parent_occurrence_id, deleted_at FROM tasks WHERE id = ?1")?;
    let tasks = tasks.into_iter().map(|task| {
        let (reminder_fired_at, snooze_until, parent_occurrence_id, deleted_at) = reminder_state.query_row([&task.id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?;
        Ok(BackupTask { task, reminder_fired_at, snooze_until, parent_occurrence_id, deleted_at })
    }).collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let backup = Backup {
        format: FORMAT.into(),
        format_version: 2,
        exported_at: Utc::now().to_rfc3339(),
        tasks,
    };
    let bytes = serde_json::to_vec_pretty(&backup)?;
    if bytes.len() as u64 > MAX_BACKUP_BYTES { bail!("Backup exceeds 50 MB"); }
    std::fs::write(destination, bytes).context("Could not write backup file")?;
    Ok(backup.tasks.len())
}

pub fn import(path: &Path, source: &Path) -> Result<ImportSummary> {
    ensure_json_path(source)?;
    let file = std::fs::File::open(source).context("Could not open backup file")?;
    if file.metadata()?.len() > MAX_BACKUP_BYTES { bail!("Backup exceeds 50 MB"); }
    let backup: Backup = serde_json::from_reader(file).context("Backup is not valid JSON")?;
    validate(&backup)?;

    let mut conn = Connection::open(path).context("Could not open tasks database")?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let tx = conn.transaction()?;
    let mut summary = ImportSummary { imported: 0, skipped: 0 };
    for entry in backup.tasks {
        let task = entry.task;
        let exists: Option<Option<String>> = tx.query_row("SELECT deleted_at FROM tasks WHERE id = ?1", [&task.id], |row| row.get(0)).optional()?;
        if let Some(deleted_at) = exists {
            if deleted_at.is_some() && entry.deleted_at.is_none() {
                tx.execute("UPDATE tasks SET deleted_at = NULL WHERE id = ?1", [&task.id])?;
                summary.imported += 1;
            } else {
                summary.skipped += 1;
            }
            continue;
        }
        if let Some(parent_id) = &entry.parent_occurrence_id {
            let duplicate: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE parent_occurrence_id = ?1)", [parent_id], |row| row.get(0)
            )?;
            if duplicate { summary.skipped += 1; continue; }
        }
        tx.execute(
            "INSERT INTO tasks (id, title, description, task_date, status, progress, priority, reminder_enabled, reminder_time, notes, created_at, updated_at, reminder_fired_at, snooze_until, recurrence, parent_occurrence_id, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![task.id, task.title, task.description, task.date, task.status.as_db(), task.progress,
                task.priority.as_db(), task.reminder.enabled, task.reminder.time, task.notes,
                task.created_at, task.updated_at, entry.reminder_fired_at, entry.snooze_until, task.recurrence.as_db(), entry.parent_occurrence_id, entry.deleted_at],
        )?;
        for child in task.subtasks {
            tx.execute(
                "INSERT INTO subtasks (id, task_id, title, completed, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![child.id, child.task_id, child.title, child.completed, child.created_at],
            )?;
        }
        summary.imported += 1;
    }
    tx.commit().context("Could not commit backup import")?;
    Ok(summary)
}

fn validate(backup: &Backup) -> Result<()> {
    if backup.format != FORMAT || !matches!(backup.format_version, 1 | 2) { bail!("Unsupported backup format or version"); }
    DateTime::parse_from_rfc3339(&backup.exported_at).context("Invalid backup timestamp")?;
    let mut task_ids = HashSet::new();
    let mut child_ids = HashSet::new();
    let mut parent_occurrence_ids = HashSet::new();
    for entry in &backup.tasks {
        let task = &entry.task;
        if task.id.is_empty() || !task_ids.insert(&task.id) { bail!("Missing or duplicate task ID"); }
        if let Some(parent_id) = &entry.parent_occurrence_id {
            if parent_id.is_empty() || !parent_occurrence_ids.insert(parent_id) { bail!("Invalid or duplicate repeat parent ID"); }
        }
        validate_title(&task.title)?;
        validate_date(&task.date)?;
        if normalize_reminder(task.reminder.clone())? != task.reminder { bail!("Invalid disabled reminder data"); }
        DateTime::parse_from_rfc3339(&task.created_at)?;
        DateTime::parse_from_rfc3339(&task.updated_at)?;
        if let Some(value) = &entry.reminder_fired_at { DateTime::parse_from_rfc3339(value)?; }
        if let Some(value) = &entry.snooze_until { DateTime::parse_from_rfc3339(value)?; }
        if let Some(value) = &entry.deleted_at { DateTime::parse_from_rfc3339(value)?; }
        if !task.reminder.enabled && (entry.reminder_fired_at.is_some() || entry.snooze_until.is_some()) { bail!("Disabled reminder has saved state"); }
        let (status, progress) = if task.subtasks.is_empty() {
            normalize_status(task.status, task.progress)
        } else {
            let done = task.subtasks.iter().filter(|child| child.completed).count();
            let total = task.subtasks.len();
            let status = if done == total { Status::Done } else if done == 0 { Status::Todo } else { Status::Doing };
            let progress = ((done * 100 + total / 2) / total) as i32;
            (status, progress)
        };
        if task.status != status || task.progress != progress { bail!("Task progress does not match its completion state"); }
        for child in &task.subtasks {
            if child.id.is_empty() || child.task_id != task.id || !child_ids.insert(&child.id) { bail!("Invalid or duplicate subtask ID"); }
            validate_title(&child.title)?;
            DateTime::parse_from_rfc3339(&child.created_at)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::{CreateTaskInput, Priority, Recurrence, Reminder};
    use uuid::Uuid;

    #[test]
    fn round_trip_and_merge_keep_existing_data() -> Result<()> {
        let folder = std::env::temp_dir().join(format!("daily-widget-backup-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&folder)?;
        let original = folder.join("original.db");
        let restored = folder.join("restored.db");
        let backup_file = folder.join("backup.json");
        db::initialize(&original)?;
        db::initialize(&restored)?;
        let task = db::create_task(&original, CreateTaskInput {
            title: "Keep this".into(), description: Some("Details".into()), date: "2026-09-26".into(),
            priority: Priority::High, reminder: Some(Reminder { enabled: true, time: Some("15:00".into()) }), notes: Some("Note".into()), recurrence: Recurrence::None,
        })?;
        db::add_subtask(&original, &task.id, "First step")?;
        db::snooze_task(&original, &task.id, 10)?;
        let existing = db::create_task(&restored, CreateTaskInput {
            title: "Already here".into(), description: None, date: "2026-09-26".into(),
            priority: Priority::Low, reminder: None, notes: None, recurrence: Recurrence::None,
        })?;
        assert_eq!(export(&original, &backup_file)?, 1);
        let summary = import(&restored, &backup_file)?;
        assert_eq!((summary.imported, summary.skipped), (1, 0));
        assert_eq!(db::get_task(&restored, &task.id)?, db::get_task(&original, &task.id)?);
        let original_snooze: String = Connection::open(&original)?.query_row("SELECT snooze_until FROM tasks WHERE id = ?1", [&task.id], |row| row.get(0))?;
        let restored_snooze: String = Connection::open(&restored)?.query_row("SELECT snooze_until FROM tasks WHERE id = ?1", [&task.id], |row| row.get(0))?;
        assert_eq!(restored_snooze, original_snooze);
        assert!(db::get_task(&restored, &existing.id)?.is_some());
        let repeated = import(&restored, &backup_file)?;
        assert_eq!((repeated.imported, repeated.skipped), (0, 1));
        db::delete_task(&restored, &task.id)?;
        let recovered = import(&restored, &backup_file)?;
        assert_eq!((recovered.imported, recovered.skipped), (1, 0));
        assert!(db::get_task(&restored, &task.id)?.is_some());
        std::fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn invalid_backup_leaves_database_unchanged() -> Result<()> {
        let folder = std::env::temp_dir().join(format!("daily-widget-invalid-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&folder)?;
        let database = folder.join("tasks.db");
        let file = folder.join("invalid.json");
        db::initialize(&database)?;
        std::fs::write(&file, r#"{"format":"other","formatVersion":1,"exportedAt":"2026-09-26T00:00:00Z","tasks":[]}"#)?;
        assert!(import(&database, &file).is_err());
        assert!(db::list_tasks(&database, None)?.is_empty());
        std::fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn old_backups_import_and_deleted_tasks_survive_new_backup() -> Result<()> {
        let folder = std::env::temp_dir().join(format!("daily-widget-compat-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&folder)?;
        let source = folder.join("source.db");
        let target = folder.join("target.db");
        let file = folder.join("backup.json");
        db::initialize(&source)?;
        db::initialize(&target)?;
        let task = db::create_task(&source, CreateTaskInput {
            title: "Recover me".into(), description: None, date: "2026-09-26".into(),
            priority: Priority::Medium, reminder: None, notes: None, recurrence: Recurrence::None,
        })?;
        assert_eq!(export(&source, &file)?, 1);
        let mut old: serde_json::Value = serde_json::from_slice(&std::fs::read(&file)?)?;
        old["formatVersion"] = 1.into();
        let entry = old["tasks"][0].as_object_mut().context("Missing task")?;
        entry.remove("recurrence");
        entry.remove("parentOccurrenceId");
        entry.remove("deletedAt");
        std::fs::write(&file, serde_json::to_vec(&old)?)?;
        assert_eq!(import(&target, &file)?.imported, 1);
        assert_eq!(db::get_task(&target, &task.id)?.unwrap().recurrence, Recurrence::None);

        db::delete_task(&source, &task.id)?;
        assert_eq!(export(&source, &file)?, 1);
        let backup: serde_json::Value = serde_json::from_slice(&std::fs::read(&file)?)?;
        assert_eq!(backup["formatVersion"], 2);
        assert!(backup["tasks"][0]["deletedAt"].is_string());
        std::fs::remove_dir_all(folder)?;
        Ok(())
    }
}
