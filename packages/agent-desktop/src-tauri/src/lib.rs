use std::collections::HashMap;
use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, RunEvent, State};
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
/// The executor is a best-effort default and is editable in the UI before Connect.
fn known_agents() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("claude", "claude-code", "claude --session-id {{sessionId}} -p {{prompt}}"),
        ("codex", "codex", "codex exec {{prompt}}"),
        ("hermes", "hermes", "hermes -p {{prompt}}"),
        ("openclaw", "openclaw", "openclaw -p {{prompt}}"),
        ("aider", "custom", "aider --message {{prompt}}"),
        ("gemini", "custom", "gemini -p {{prompt}}"),
        ("opencode", "custom", "opencode run {{prompt}}"),
        ("cursor-agent", "custom", "cursor-agent {{prompt}}"),
    ]
}

/// Scan PATH for the agent CLIs we recognise. Runs `<cmd> --version` per
/// candidate, so it's kept off the command thread (see `detect_agents`).
fn detect_agents_blocking() -> Vec<DetectedAgent> {
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

/// Async command: runs the blocking scan on a worker thread so a slow/hanging
/// `--version` can't freeze the UI.
#[tauri::command]
async fn detect_agents() -> Vec<DetectedAgent> {
    tauri::async_runtime::spawn_blocking(detect_agents_blocking)
        .await
        .unwrap_or_default()
}

/// Grab a free loopback port by binding to :0 and reading the assigned port.
///
/// Note: this releases the port before the runner re-binds it, so there's a
/// small TOCTOU window where another process could claim it. If that happens
/// the runner logs a bind failure (drained to our log) and its Connected card
/// shows no status. Ephemeral-port collisions are rare in practice; passing an
/// inherited socket fd to the sidecar would close the window entirely (future).
fn pick_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(0)
}

/// Path to the persisted connected-agents file (holds agent tokens; 0600).
fn agents_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("connected-agents.json"))
}

/// Load the persisted connected-agents JSON (returns "[]" when absent).
#[tauri::command]
fn load_agents(app: tauri::AppHandle) -> String {
    agents_file(&app)
        .and_then(|p| fs::read_to_string(p).ok())
        .unwrap_or_else(|| "[]".to_string())
}

/// Persist the connected-agents JSON with owner-only permissions. Storing
/// tokens in a 0600 file (not the webview's localStorage) keeps them out of
/// reach of any in-page script.
#[tauri::command]
fn save_agents(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = agents_file(&app).ok_or("no app config dir")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, json).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Read a CLI's on-disk conversation transcript for a given session id.
///
/// Agent CLIs (Claude Code today) persist each run as `<session-id>.jsonl` under
/// `~/.claude/projects/<project-slug>/`. Because the session id is a unique UUID
/// we mint per dispatch, a filename match across the project dirs is enough — we
/// don't need to know the working directory the CLI ran in. Returns the raw JSONL
/// (parsed in the webview), or `None` when no transcript exists yet.
#[tauri::command]
fn read_agent_transcript(app: tauri::AppHandle, session_id: String) -> Result<Option<String>, String> {
    // The id becomes a filename, so refuse anything that isn't UUID-shaped
    // (defends against `..`/path separators reaching the join below).
    if session_id.is_empty() || !session_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid session id".into());
    }
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let projects = home.join(".claude").join("projects");
    let file_name = format!("{session_id}.jsonl");
    let Ok(entries) = fs::read_dir(&projects) else {
        return Ok(None);
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if dir.is_dir() {
            let candidate = dir.join(&file_name);
            if candidate.is_file() {
                return fs::read_to_string(&candidate).map(Some).map_err(|e| e.to_string());
            }
        }
    }
    Ok(None)
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

    // Token goes via env, not argv, so it isn't visible in `ps aux` /
    // /proc/<pid>/cmdline. The runner reads STARSHIP_AGENT_TOKEN in loadConfig().
    let sidecar = app
        .shell()
        .sidecar("starship-agent")
        .map_err(|e| e.to_string())?
        .env("STARSHIP_AGENT_TOKEN", &token)
        .args([
            "run",
            "--endpoint",
            &mcp_url,
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
            list_runners,
            load_agents,
            save_agents,
            read_agent_transcript
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Fires once when the app exits (not per-window) — stop every runner.
            if let RunEvent::Exit = event {
                if let Some(pool) = app_handle.try_state::<RunnerPool>() {
                    for (_, proc) in pool.0.lock().unwrap().drain() {
                        let _ = proc.child.kill();
                    }
                }
            }
        });
}
