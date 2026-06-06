use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Instant, UNIX_EPOCH};

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
            .stdin(Stdio::null())
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

// ---- Local app-data layout ----
//
// Everything lives under the platform app-data dir (on macOS:
// ~/Library/Application Support/<bundle id>):
//
//   store.json            config blob: runtimes, personas, heartbeats, onboarding,
//                          schemaVersion. Small + fully rewritten on each change.
//   conversations/<id>.jsonl   one append-only thread per file (header line + turns).
//   events.jsonl          append-only activity log.
//
// Conversations and events are JSONL so turns/events append without rewriting the
// whole history (no message caps, no blob churn). All files are owner-only (0600).

/// Tighten a freshly written file to owner-only on Unix (no-op elsewhere).
fn set_owner_only(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
}

/// Root of the app's local state. `None` only if the platform dir can't be resolved.
fn data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok()
}

/// Last-modified time in ms since the epoch (0 if unavailable). Used to order
/// conversations by recency without bumping a field in the file on every append.
fn mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A conversation/session id becomes a filename, so it must be UUID-shaped —
/// reject anything that could escape the conversations dir (`..`, separators).
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn store_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    data_dir(app).map(|d| d.join("store.json"))
}

/// Ensure and return the conversations dir.
fn conversations_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app).ok_or("no app data dir")?.join("conversations");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resolve `conversations/<id>.jsonl`, validating the id first.
fn conversation_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("invalid conversation id".into());
    }
    Ok(conversations_dir(app)?.join(format!("{id}.jsonl")))
}

fn events_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    data_dir(app).map(|d| d.join("events.jsonl"))
}

/// Append one or more already-serialized JSONL lines to `path`, creating it if
/// absent. Blank lines are skipped; each kept line gets a trailing newline.
fn append_lines(path: &Path, lines: &[String]) -> Result<(), String> {
    use std::io::Write;
    let mut buf = String::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        buf.push_str(trimmed);
        buf.push('\n');
    }
    if buf.is_empty() {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    f.write_all(buf.as_bytes()).map_err(|e| e.to_string())?;
    set_owner_only(path);
    Ok(())
}

/// Load the config JSON blob (returns "{}" when absent).
#[tauri::command]
fn read_store(app: tauri::AppHandle) -> String {
    store_file(&app)
        .and_then(|p| fs::read_to_string(p).ok())
        .unwrap_or_else(|| "{}".to_string())
}

/// Persist the config JSON blob with owner-only permissions.
#[tauri::command]
fn write_store(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = store_file(&app).ok_or("no app data dir")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Write to a sibling temp file then rename over the target: rename is atomic on
    // POSIX, so a crash mid-write can't leave store.json truncated or half-written.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| e.to_string())?;
    set_owner_only(&tmp);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// One conversation as surfaced to the sidebar list: its filename id, the raw
/// header line (first line of the file, holding title/persona/session), and the
/// file's mtime for recency ordering. The webview parses the header.
#[derive(Serialize)]
struct ConversationHeader {
    id: String,
    header: String,
    updated_at_ms: u64,
}

/// List threads cheaply: read only the first (header) line of each `*.jsonl`.
#[tauri::command]
fn list_conversations(app: tauri::AppHandle) -> Result<Vec<ConversationHeader>, String> {
    let dir = conversations_dir(&app)?;
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !valid_id(id) {
            continue;
        }
        let Ok(file) = fs::File::open(&path) else {
            continue;
        };
        let mut header = String::new();
        if BufReader::new(file).read_line(&mut header).is_err() {
            continue;
        }
        let header = header.trim().to_string();
        if header.is_empty() {
            continue;
        }
        out.push(ConversationHeader {
            id: id.to_string(),
            header,
            updated_at_ms: mtime_ms(&path),
        });
    }
    Ok(out)
}

/// Full JSONL for one thread (header line + turns), or `None` if it doesn't exist.
#[tauri::command]
fn read_conversation(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let path = conversation_path(&app, &id)?;
    Ok(fs::read_to_string(&path).ok())
}

/// Create a thread file with its header line. Idempotent: a no-op if it exists,
/// so a re-issued create never clobbers an in-progress transcript.
#[tauri::command]
fn create_conversation(app: tauri::AppHandle, id: String, header: String) -> Result<(), String> {
    use std::io::Write;
    let path = conversation_path(&app, &id)?;
    // create_new is atomic: it creates the file only if absent, so a concurrent
    // create (or a fast webview retry) can't clobber an in-progress transcript.
    // AlreadyExists is the idempotent no-op case.
    let mut f = match fs::OpenOptions::new().create_new(true).write(true).open(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    let mut line = header.trim().to_string();
    line.push('\n');
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    set_owner_only(&path);
    Ok(())
}

/// Append turn lines to a thread (fast path — pure append, no rewrite).
#[tauri::command]
fn append_conversation(app: tauri::AppHandle, id: String, lines: Vec<String>) -> Result<(), String> {
    let path = conversation_path(&app, &id)?;
    append_lines(&path, &lines)
}

/// Replace a thread's header line (rename, or session id set after turn 1). Rare,
/// so rewriting the small file is fine; turn appends stay a pure append.
///
/// NOTE: this read-modify-write is NOT atomic with `append_conversation`. If an
/// append lands between the read and the write here, those turns are overwritten.
/// The webview serialises meta updates so they only run after a run completes (no
/// append in flight), which holds today — but if that invariant is relaxed, this
/// needs a per-id lock (e.g. a `DashMap<String, Mutex<()>>`) or a meta sidecar.
#[tauri::command]
fn update_conversation_meta(app: tauri::AppHandle, id: String, header: String) -> Result<(), String> {
    let path = conversation_path(&app, &id)?;
    let existing = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let new_header = header.trim();
    let mut lines: Vec<&str> = existing.lines().collect();
    if lines.is_empty() {
        lines.push(new_header);
    } else {
        lines[0] = new_header;
    }
    let mut out = lines.join("\n");
    out.push('\n');
    // Temp file + atomic rename (same as write_store) so a crash mid-write can't
    // leave the conversation truncated or empty.
    let tmp = path.with_extension("jsonl.tmp");
    fs::write(&tmp, out).map_err(|e| e.to_string())?;
    set_owner_only(&tmp);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a thread file. Idempotent: a missing file is a no-op.
#[tauri::command]
fn delete_conversation(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = conversation_path(&app, &id)?;
    // Match NotFound directly rather than pre-checking exists() — atomic, and a
    // concurrent delete between the two can't surface a spurious error.
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Append one serialized event line to the activity log.
#[tauri::command]
fn append_event(app: tauri::AppHandle, line: String) -> Result<(), String> {
    let path = events_file(&app).ok_or("no app data dir")?;
    append_lines(&path, &[line])
}

/// Full events JSONL (empty string when absent). The webview parses + slices it.
#[tauri::command]
fn read_events(app: tauri::AppHandle) -> String {
    events_file(&app)
        .and_then(|p| fs::read_to_string(p).ok())
        .unwrap_or_default()
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
    if !valid_id(&session_id) {
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
            list_conversations,
            read_conversation,
            create_conversation,
            append_conversation,
            update_conversation_meta,
            delete_conversation,
            append_event,
            read_events,
            read_agent_transcript,
            run_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
