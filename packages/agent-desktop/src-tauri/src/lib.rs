use std::collections::HashMap;
use std::net::TcpListener;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// A running runner sidecar process + how to reach its loopback control API.
struct RunnerProc {
    child: CommandChild,
    control_port: u16,
    control_token: String,
    agent_id: String,
}

#[derive(Default)]
struct RunnerPool(Mutex<HashMap<String, RunnerProc>>);

#[derive(Serialize, Clone)]
struct RunnerInfo {
    runner_id: String,
    agent_id: String,
    control_port: u16,
    control_token: String,
}

#[derive(Serialize)]
struct DetectedAgent {
    kind: String,
    command: String,
    path: String,
    version: Option<String>,
    default_executor: String,
}

/// Curated map of agent CLIs we know how to drive: (command, AgentKind, default executor).
fn known_agents() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("claude", "claude-code", "claude -p {{prompt}}"),
        ("codex", "codex", "codex exec {{prompt}}"),
        ("aider", "custom", "aider --message {{prompt}}"),
        ("gemini", "custom", "gemini -p {{prompt}}"),
        ("opencode", "custom", "opencode run {{prompt}}"),
        ("cursor-agent", "custom", "cursor-agent {{prompt}}"),
    ]
}

/// Scan PATH for the agent CLIs we recognise.
#[tauri::command]
fn detect_agents() -> Vec<DetectedAgent> {
    let mut out = Vec::new();
    for (cmd, kind, default_executor) in known_agents() {
        let Ok(path) = which::which(cmd) else { continue };
        let version = std::process::Command::new(cmd)
            .arg("--version")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty());
        out.push(DetectedAgent {
            kind: kind.to_string(),
            command: cmd.to_string(),
            path: path.to_string_lossy().to_string(),
            version,
            default_executor: default_executor.to_string(),
        });
    }
    out
}

/// Grab a free loopback port by binding to :0 and reading the assigned port.
fn pick_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(0)
}

/// Spawn a runner sidecar for one connected agent and track it in the pool.
#[tauri::command]
fn start_runner(
    app: tauri::AppHandle,
    pool: State<'_, RunnerPool>,
    agent_id: String,
    token: String,
    mcp_url: String,
    executor: String,
) -> Result<RunnerInfo, String> {
    let port = pick_port();
    if port == 0 {
        return Err("could not allocate a loopback port".into());
    }
    let control_token = uuid::Uuid::new_v4().to_string();
    let runner_id = uuid::Uuid::new_v4().to_string();

    let sidecar = app
        .shell()
        .sidecar("starship-agent")
        .map_err(|e| e.to_string())?
        .args([
            "run",
            "--endpoint",
            &mcp_url,
            "--token",
            &token,
            "--executor",
            &executor,
            "--control-port",
            &port.to_string(),
            "--control-token",
            &control_token,
        ]);
    let (mut rx, child) = sidecar.spawn().map_err(|e| e.to_string())?;

    let aid = agent_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => log::info!("[{}] {}", aid, String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => log::warn!("[{}] {}", aid, String::from_utf8_lossy(&line)),
                CommandEvent::Terminated(payload) => {
                    log::warn!("[{}] runner exited: {:?}", aid, payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    let info = RunnerInfo {
        runner_id: runner_id.clone(),
        agent_id: agent_id.clone(),
        control_port: port,
        control_token: control_token.clone(),
    };
    pool.0.lock().unwrap().insert(
        runner_id,
        RunnerProc {
            child,
            control_port: port,
            control_token,
            agent_id,
        },
    );
    Ok(info)
}

#[tauri::command]
fn stop_runner(pool: State<'_, RunnerPool>, runner_id: String) -> Result<(), String> {
    if let Some(proc) = pool.0.lock().unwrap().remove(&runner_id) {
        let _ = proc.child.kill();
    }
    Ok(())
}

#[tauri::command]
fn list_runners(pool: State<'_, RunnerPool>) -> Vec<RunnerInfo> {
    pool.0
        .lock()
        .unwrap()
        .iter()
        .map(|(id, p)| RunnerInfo {
            runner_id: id.clone(),
            agent_id: p.agent_id.clone(),
            control_port: p.control_port,
            control_token: p.control_token.clone(),
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .manage(RunnerPool::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_agents,
            start_runner,
            stop_runner,
            list_runners
        ])
        .on_window_event(|window, event| {
            // Stop every runner when the last window closes.
            if let WindowEvent::Destroyed = event {
                if let Some(pool) = window.app_handle().try_state::<RunnerPool>() {
                    for (_, proc) in pool.0.lock().unwrap().drain() {
                        let _ = proc.child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
