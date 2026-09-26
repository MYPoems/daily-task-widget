mod commands;
mod reminder;

use task_core::db;
use tauri::{Emitter, Manager, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_window_state::StateFlags;

fn reveal(app: &tauri::AppHandle, event: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        ensure_window_visible(&window);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(event) = event { let _ = window.emit(event, ()); }
    }
}

fn ensure_window_visible(window: &tauri::WebviewWindow) {
    let (Ok(position), Ok(size), Ok(monitors)) =
        (window.outer_position(), window.outer_size(), window.available_monitors()) else { return; };
    let visible = monitors.iter().any(|monitor| {
        let screen = monitor.position();
        let bounds = monitor.size();
        let overlap_x = (i64::from(position.x) + i64::from(size.width))
            .min(i64::from(screen.x) + i64::from(bounds.width))
            - i64::from(position.x).max(i64::from(screen.x));
        let overlap_y = (i64::from(position.y) + i64::from(size.height))
            .min(i64::from(screen.y) + i64::from(bounds.height))
            - i64::from(position.y).max(i64::from(screen.y));
        overlap_x >= 64 && overlap_y >= 64
    });
    if !visible { let _ = window.center(); }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| reveal(app, None)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default()
            .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
            .build())
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == ShortcutState::Pressed { reveal(app, Some("open-quick-add")); }
            })
            .build())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") { ensure_window_visible(&window); }
            let path = app.path().app_data_dir()?.join("tasks.sqlite3");
            db::initialize(&path).map_err(|error| {
                std::io::Error::other(format!("Database setup failed: {error}"))
            })?;
            app.manage(commands::task::DatabaseState { path: path.clone() });
            app.manage(reminder::start(app.handle().clone(), path));

            if let Err(error) = app.global_shortcut().register("Ctrl+Alt+T") {
                eprintln!("Global shortcut Ctrl+Alt+T unavailable: {error}");
            }

            let open = MenuItem::with_id(app, "open", "Open Widget / 打开", true, None::<&str>)?;
            let quick = MenuItem::with_id(app, "quick", "Quick Add / 快速添加", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings / 设置", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit / 退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quick, &settings, &exit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app icon missing").clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => reveal(app, None),
                    "quick" => reveal(app, Some("open-quick-add")),
                    "settings" => reveal(app, Some("open-settings")),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) { let _ = window.hide(); }
                            else { reveal(app, None); }
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(true) = event {
                if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                    ensure_window_visible(&webview);
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::task::create_task,
            commands::task::list_tasks,
            commands::task::get_task,
            commands::task::update_task,
            commands::task::delete_task,
            commands::task::restore_task,
            commands::task::list_deleted_tasks,
            commands::task::snooze_task,
            commands::task::add_subtask,
            commands::task::set_subtask_completed,
            commands::task::delete_subtask,
            commands::task::export_backup,
            commands::task::import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Daily Task Widget");
}
