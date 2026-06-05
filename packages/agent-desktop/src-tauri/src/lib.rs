use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Instant;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::Manager;

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
        let version = Command::new(cmd)
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

/// Path to the local state file. Holds the whole app store (runtimes, personas,
/// heartbeats, events) as one JSON blob, with owner-only (0600) permissions.
fn store_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("store.json"))
}

/// Load the local state JSON (returns "{}" when absent).
#[tauri::command]
fn read_store(app: tauri::AppHandle) -> String {
    store_file(&app)
        .and_then(|p| fs::read_to_string(p).ok())
        .unwrap_or_else(|| "{}".to_string())
}

/// Persist the local state JSON with owner-only permissions.
#[tauri::command]
fn write_store(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = store_file(&app).ok_or("no app config dir")?;
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
/// we mint per run, a filename match across the project dirs is enough — we
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

/// Slim result returned once the process exits. The full output is delivered
/// live over the `Channel` (see `StreamMsg`), so we no longer capture/truncate it
/// here — the webview accumulates the stream and, for Claude, the on-disk
/// transcript holds the durable copy.
#[derive(Serialize)]
struct RunResult {
    exit_code: Option<i32>,
    duration_ms: u64,
}

/// One streamed message from a run, sent over the IPC channel as it happens.
/// Serializes to `{ kind: "stdout"|"stderr"|"exit", data: {...} }` (camelCase).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "data")]
enum StreamMsg {
    Stdout { line: String },
    Stderr { line: String },
    Exit { exit_code: Option<i32>, duration_ms: u64 },
}

/// Run an agent CLI once, streaming each stdout/stderr line over `on_event` as it
/// arrives, then return the exit code + duration.
///
/// Safety: the command + args are passed as an ARGV ARRAY (no shell), so a
/// prompt baked into an arg is a discrete argument and cannot inject shell
/// metacharacters. Templating ({{prompt}}, {{sessionId}}, …) happens in the
/// webview before this is called; here we just spawn and stream.
///
/// stdin is set to null so CLIs that read stdin in non-interactive mode (e.g.
/// `codex exec`) see EOF instead of blocking forever.
///
/// Note: there is no timeout yet — a CLI that never exits will leave this call
/// pending. Acceptable for a single-user local app; revisit if it bites.
fn run_agent_blocking(
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    on_event: Channel<StreamMsg>,
) -> Result<RunResult, String> {
    let started = Instant::now();
    let mut child = Command::new(&command)
        .args(&args)
        .envs(&env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start {command}: {e}"))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    // Drain stderr on a helper thread (Channel is Clone + Send + Sync) while we
    // drain stdout here, so neither pipe's buffer can fill and deadlock the child.
    let err_event = on_event.clone();
    let stderr_handle = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = err_event.send(StreamMsg::Stderr { line });
        }
    });

    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let _ = on_event.send(StreamMsg::Stdout { line });
    }
    let _ = stderr_handle.join();

    let status = child.wait().map_err(|e| e.to_string())?;
    let exit_code = status.code();
    let duration_ms = started.elapsed().as_millis() as u64;
    let _ = on_event.send(StreamMsg::Exit { exit_code, duration_ms });
    Ok(RunResult { exit_code, duration_ms })
}

/// Async command: runs the agent on a worker thread so the UI stays responsive
/// while the CLI works.
#[tauri::command]
async fn run_agent(
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    on_event: Channel<StreamMsg>,
) -> Result<RunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_agent_blocking(command, args, env, on_event))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
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
            read_store,
            write_store,
            read_agent_transcript,
            run_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
