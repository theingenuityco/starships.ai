use std::net::TcpListener;
use std::sync::Mutex;

use tauri::{Manager, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The spawned runner sidecar plus the loopback control coordinates the
/// frontend needs to reach it.
struct RunnerHandle {
    port: u16,
    token: String,
    child: Mutex<Option<CommandChild>>,
}

#[derive(serde::Serialize)]
struct RunnerInfo {
    port: u16,
    token: String,
}

/// Frontend calls this on startup to learn how to reach the bundled runner.
#[tauri::command]
fn runner_info(state: State<RunnerHandle>) -> RunnerInfo {
    RunnerInfo {
        port: state.port,
        token: state.token.clone(),
    }
}

/// Grab a free loopback port by binding to :0 and reading the assigned port.
fn pick_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(7777)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let port = pick_port();
            let token = uuid::Uuid::new_v4().to_string();

            // Spawn the runner sidecar with its control API on the chosen port.
            let sidecar = app
                .shell()
                .sidecar("starship-agent")?
                .args([
                    "run",
                    "--control-port",
                    &port.to_string(),
                    "--control-token",
                    &token,
                ]);
            let (mut rx, child) = sidecar.spawn()?;

            // Drain the sidecar's output to our log so it isn't lost.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log::info!("[runner] {}", String::from_utf8_lossy(&line))
                        }
                        CommandEvent::Stderr(line) => {
                            log::warn!("[runner] {}", String::from_utf8_lossy(&line))
                        }
                        CommandEvent::Terminated(payload) => {
                            log::warn!("[runner] exited: {:?}", payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            app.manage(RunnerHandle {
                port,
                token,
                child: Mutex::new(Some(child)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![runner_info])
        .on_window_event(|window, event| {
            // Stop the runner when the last window closes.
            if let WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<RunnerHandle>() {
                    if let Some(child) = state.child.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
