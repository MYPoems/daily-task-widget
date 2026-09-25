use std::path::PathBuf;

use tauri::State;

use task_core::{
    db,
    task::{CreateTaskInput, Task, UpdateTaskInput},
};
use crate::reminder::ReminderSender;

pub struct DatabaseState {
    pub path: PathBuf,
}

#[tauri::command]
pub fn create_task(
    state: State<'_, DatabaseState>,
    reminders: State<'_, ReminderSender>,
    input: CreateTaskInput,
) -> Result<Task, String> {
    let task = db::create_task(&state.path, input).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(task)
}

#[tauri::command]
pub fn list_tasks(
    state: State<'_, DatabaseState>,
    date: Option<String>,
) -> Result<Vec<Task>, String> {
    db::list_tasks(&state.path, date.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_task(state: State<'_, DatabaseState>, id: String) -> Result<Option<Task>, String> {
    db::get_task(&state.path, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_task(
    state: State<'_, DatabaseState>,
    reminders: State<'_, ReminderSender>,
    input: UpdateTaskInput,
) -> Result<Task, String> {
    let task = db::update_task(&state.path, input).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(task)
}

#[tauri::command]
pub fn delete_task(state: State<'_, DatabaseState>, reminders: State<'_, ReminderSender>, id: String) -> Result<bool, String> {
    let deleted = db::delete_task(&state.path, &id).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(deleted)
}

#[tauri::command]
pub fn snooze_task(state: State<'_, DatabaseState>, reminders: State<'_, ReminderSender>, id: String, minutes: i64) -> Result<(), String> {
    db::snooze_task(&state.path, &id, minutes).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(())
}

#[tauri::command]
pub fn add_subtask(state: State<'_, DatabaseState>, reminders: State<'_, ReminderSender>, task_id: String, title: String) -> Result<Task, String> {
    let task = db::add_subtask(&state.path, &task_id, &title).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(task)
}

#[tauri::command]
pub fn set_subtask_completed(state: State<'_, DatabaseState>, reminders: State<'_, ReminderSender>, id: String, completed: bool) -> Result<Task, String> {
    let task = db::set_subtask_completed(&state.path, &id, completed).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(task)
}

#[tauri::command]
pub fn delete_subtask(state: State<'_, DatabaseState>, reminders: State<'_, ReminderSender>, id: String) -> Result<Task, String> {
    let task = db::delete_subtask(&state.path, &id).map_err(|error| error.to_string())?;
    let _ = reminders.0.send(());
    Ok(task)
}
