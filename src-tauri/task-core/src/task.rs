use anyhow::{bail, Result};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Todo,
    Doing,
    Done,
}

impl Status {
    pub fn as_db(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Doing => "doing",
            Self::Done => "done",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "todo" => Some(Self::Todo),
            "doing" => Some(Self::Doing),
            "done" => Some(Self::Done),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Medium,
    High,
}

impl Priority {
    pub fn as_db(self) -> i64 {
        match self {
            Self::Low => 0,
            Self::Medium => 1,
            Self::High => 2,
        }
    }

    pub fn from_db(value: i64) -> Option<Self> {
        match value {
            0 => Some(Self::Low),
            1 => Some(Self::Medium),
            2 => Some(Self::High),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub enabled: bool,
    pub time: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub date: String,
    pub status: Status,
    pub progress: i32,
    pub priority: Priority,
    pub reminder: Reminder,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub subtasks: Vec<Subtask>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub completed: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub title: String,
    pub description: Option<String>,
    pub date: String,
    pub priority: Priority,
    pub reminder: Option<Reminder>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub date: String,
    pub status: Status,
    pub progress: i32,
    pub priority: Priority,
    pub reminder: Reminder,
    pub notes: Option<String>,
}

pub fn validate_title(title: &str) -> Result<&str> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 200 {
        bail!("Task title must contain 1–200 characters");
    }
    Ok(title)
}

pub fn validate_date(date: &str) -> Result<()> {
    if date.len() != 10 || NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        bail!("Task date must be a valid YYYY-MM-DD date");
    }
    Ok(())
}

pub fn normalize_reminder(reminder: Reminder) -> Result<Reminder> {
    if !reminder.enabled {
        return Ok(Reminder::default());
    }
    let time = reminder.time.as_deref().unwrap_or_default();
    let valid = time.len() == 5
        && time.as_bytes()[2] == b':'
        && time[..2].parse::<u8>().is_ok_and(|h| h < 24)
        && time[3..].parse::<u8>().is_ok_and(|m| m < 60);
    if !valid {
        bail!("Reminder time must be HH:MM when enabled");
    }
    Ok(reminder)
}

pub fn normalize_status(status: Status, progress: i32) -> (Status, i32) {
    let progress = progress.clamp(0, 100);
    match status {
        Status::Done => (Status::Done, 100),
        _ if progress == 100 => (Status::Done, 100),
        _ => (status, progress),
    }
}
