use std::{path::PathBuf, sync::mpsc::{self, Sender}, time::Duration};

use chrono::Local;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use task_core::db;

#[derive(Clone)]
pub struct ReminderSender(pub Sender<()>);

pub fn start(app: AppHandle, path: PathBuf) -> ReminderSender {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || loop {
        let now = Local::now();
        let reminders = match db::pending_reminders(&path, now) {
            Ok(reminders) => reminders,
            Err(error) => {
                eprintln!("Reminder lookup failed: {error}");
                if receiver.recv_timeout(Duration::from_secs(60)).is_err() { continue; }
                continue;
            }
        };
        let due_now = reminders.first().is_some_and(|item| item.due_at <= now);
        let mut retry_later = false;
        for reminder in reminders.iter().take_while(|item| item.due_at <= now) {
            match db::claim_reminder(&path, &reminder.id) {
                Ok(true) => {
                    let body = format!("{} · {}%", reminder.title, reminder.progress);
                    if let Err(error) = app.notification().builder().title("Daily Task Widget · 任务提醒").body(&body).show() {
                        eprintln!("Could not show reminder notification: {error}");
                        if let Err(release_error) = db::release_reminder(&path, &reminder.id) {
                            eprintln!("Could not reschedule reminder: {release_error}");
                        }
                        retry_later = true;
                    }
                }
                Ok(false) => {}
                Err(error) => { eprintln!("Could not claim reminder: {error}"); retry_later = true; }
            }
        }
        if due_now {
            if retry_later { let _ = receiver.recv_timeout(Duration::from_secs(60)); }
            continue;
        }
        let wait = reminders.first()
            .and_then(|item| (item.due_at - Local::now()).to_std().ok())
            .unwrap_or(Duration::from_secs(60))
            .min(Duration::from_secs(60));
        let _ = receiver.recv_timeout(wait);
    });
    ReminderSender(sender)
}
