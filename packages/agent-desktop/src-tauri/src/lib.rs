use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{Emitter, Manager};

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
        // Codex is driven via its app-server JSON-RPC (see engine.ts), not `codex exec` —
        // exec mode has no mid-run approval channel. The template is informational.
        ("codex", "codex", "codex app-server"),
        // Hermes one-shot is `chat -q` (NOT `-p`, which is --profile in Hermes).
        ("hermes", "hermes", "hermes chat -q {{prompt}}"),
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
//   store.json            config blob: heartbeats, providers, onboarding,
//                          schemaVersion. Small + fully rewritten on each change.
//   config/               dedicated folder for the agent definition + secrets:
//     personas/<id>.json    one persona record per file.
//     runtimes/<id>.json    one runtime record per file.
//     secrets.enc           AES-256-GCM ciphertext of the provider-key map; the
//                           32-byte master key lives in the OS keychain, never on disk.
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

/// Ensure and return the dedicated config folder (personas, runtimes, encrypted secrets).
fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app).ok_or("no app data dir")?.join("config");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Ensure and return `config/personas`.
fn personas_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = config_dir(app)?.join("personas");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Ensure and return `config/runtimes`.
fn runtimes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = config_dir(app)?.join("runtimes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Read every `*.json` record in `dir` as a raw JSON string; the webview parses them.
/// Missing/unreadable files are skipped (a record dir is created lazily on first write).
fn read_records(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(s) = fs::read_to_string(&path) {
            let t = s.trim().to_string();
            if !t.is_empty() {
                out.push(t);
            }
        }
    }
    out
}

/// Atomically write one record file `<dir>/<id>.json` (0600). `id` must be UUID-shaped so
/// it can't escape the dir; the temp+rename keeps a crash from leaving a half-written record.
fn write_record(dir: &Path, id: &str, json: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid record id".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{id}.json"));
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    set_owner_only(&tmp);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete one record file (idempotent: a missing file is a no-op).
fn delete_record(dir: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid record id".into());
    }
    match fs::remove_file(dir.join(format!("{id}.json"))) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn list_personas(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(read_records(&personas_dir(&app)?))
}

#[tauri::command]
fn write_persona(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    write_record(&personas_dir(&app)?, &id, &json)
}

#[tauri::command]
fn delete_persona(app: tauri::AppHandle, id: String) -> Result<(), String> {
    delete_record(&personas_dir(&app)?, &id)
}

#[tauri::command]
fn list_runtimes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(read_records(&runtimes_dir(&app)?))
}

#[tauri::command]
fn write_runtime(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    write_record(&runtimes_dir(&app)?, &id, &json)
}

#[tauri::command]
fn delete_runtime(app: tauri::AppHandle, id: String) -> Result<(), String> {
    delete_record(&runtimes_dir(&app)?, &id)
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
    // Lock down to 0600 before any content is written — the file is created at the
    // process umask (often 0644), so tightening first means the header is never
    // world-readable, even momentarily.
    set_owner_only(&path);
    let mut line = header.trim().to_string();
    line.push('\n');
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
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

// ---- Tool-permission approval back-channel ----
//
// We drive agent CLIs headlessly, so they can't prompt for tool approval interactively.
// claude-code, hermes and cursor-agent each support a *hook*: before running a gated
// tool the CLI spawns a command, pipes a JSON event to its stdin, and reads a decision
// from its stdout. We make that command a tiny `curl` that POSTs to this loopback server
// (one endpoint per CLI, since each expects a different decision JSON shape). The server
// parks the request, emits a `permission-request` Tauri event (the webview pops the
// dialog), and blocks until the webview calls `resolve_approval`; the HTTP response body
// becomes the hook's stdout. (codex is different — it has no hook; it's driven over its
// app-server JSON-RPC, where approvals are answered on the process's own stdin.)
//
// The server is dumb on purpose: it relays and waits. All policy (auto-allow listed
// tools, "allow always") lives in the webview. Requests are correlated to a run by the
// `X-Starship-Dispatch` header (the run's dispatchId, which we set in the run env so the
// hook subprocess can forward it), falling back to the CLI's own session/conversation id.

type Pending = Arc<Mutex<HashMap<String, Sender<String>>>>;

/// Managed state: the loopback port (handed to the webview so it can build the hook
/// command) and the map of in-flight approvals awaiting a decision.
struct ApprovalState {
    port: u16,
    pending: Pending,
}

/// Process-unique id per parked approval (monotonic; only needs to be unique in-process).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

/// Which CLI's hook posted — selects how we parse the request and shape the response.
#[derive(Clone, Copy, PartialEq)]
enum HookFormat {
    Claude,
    Hermes,
    Cursor,
}

impl HookFormat {
    fn from_path(path: &str) -> Option<Self> {
        // Ignore any query string.
        match path.split('?').next().unwrap_or(path) {
            "/hook/claude" => Some(Self::Claude),
            "/hook/hermes" => Some(Self::Hermes),
            "/hook/cursor" => Some(Self::Cursor),
            _ => None,
        }
    }
    fn runtime(self) -> &'static str {
        match self {
            Self::Claude => "claude-code",
            Self::Hermes => "hermes",
            Self::Cursor => "cursor",
        }
    }
}

/// Payload emitted to the webview for each gated tool call.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionRequest {
    id: String,
    /// Correlation key: the run's dispatchId (preferred) or the CLI's own session id.
    correlation: String,
    runtime: String,
    tool_name: String,
    tool_input: serde_json::Value,
}

/// Format the decision JSON each CLI's hook expects on stdout. `decision` is one of
/// "allow", "allow-session" (treated as allow) or "deny".
fn hook_decision_json(format: HookFormat, decision: &str) -> String {
    let allow = decision == "allow" || decision == "allow-session";
    match format {
        // https://code.claude.com hooks: PreToolUse permissionDecision allow|deny.
        HookFormat::Claude => {
            let d = if allow { "allow" } else { "deny" };
            format!(
                "{{\"hookSpecificOutput\":{{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"{d}\",\"permissionDecisionReason\":\"Starship desktop approval\"}}}}"
            )
        }
        // Hermes hooks: allow = empty object, deny = {"decision":"block","reason":...}.
        HookFormat::Hermes => {
            if allow {
                "{}".to_string()
            } else {
                "{\"decision\":\"block\",\"reason\":\"Denied in Starship desktop\"}".to_string()
            }
        }
        // Cursor hooks: {"permission":"allow"|"deny", ...}. (Only deny is reliably enforced.)
        HookFormat::Cursor => {
            if allow {
                "{\"permission\":\"allow\"}".to_string()
            } else {
                "{\"permission\":\"deny\",\"agent_message\":\"Denied in Starship desktop\"}".to_string()
            }
        }
    }
}

/// Pull `(toolName, toolInput, fallbackCorrelation)` out of a hook payload per format.
fn parse_hook_payload(format: HookFormat, body: &serde_json::Value) -> (String, serde_json::Value, String) {
    let get_str = |k: &str| body.get(k).and_then(|v| v.as_str()).unwrap_or_default().to_string();
    match format {
        HookFormat::Claude | HookFormat::Hermes => (
            get_str("tool_name"),
            body.get("tool_input").cloned().unwrap_or(serde_json::Value::Null),
            get_str("session_id"),
        ),
        // Cursor's beforeShellExecution payload is a shell command, not a named tool.
        HookFormat::Cursor => {
            let command = get_str("command");
            (
                "Shell".to_string(),
                serde_json::json!({ "command": command }),
                get_str("conversation_id"),
            )
        }
    }
}

/// Read the `X-Starship-Dispatch` correlation header, if present (case-insensitive).
fn dispatch_header(request: &tiny_http::Request) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("x-starship-dispatch"))
        .map(|h| h.value.as_str().to_string())
        .filter(|s| !s.is_empty())
}

/// Handle one POSTed hook event: park it, notify the webview, block for the decision
/// (default deny after a generous timeout so a closed dialog can't wedge a run forever).
fn handle_approval_request(mut request: tiny_http::Request, app: tauri::AppHandle, pending: Pending) {
    let format = match HookFormat::from_path(request.url()) {
        Some(f) if request.method() == &tiny_http::Method::Post => f,
        _ => {
            let _ = request.respond(tiny_http::Response::from_string("not found").with_status_code(404));
            return;
        }
    };

    let header_correlation = dispatch_header(&request);
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(tiny_http::Response::from_string(hook_decision_json(format, "deny")));
        return;
    }
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
    let (tool_name, tool_input, payload_correlation) = parse_hook_payload(format, &parsed);
    let correlation = header_correlation.unwrap_or(payload_correlation);

    // Random, unguessable id: this is a raw loopback HTTP server reachable by any local
    // process, so a sequential counter would let one forge an approval for a parked request.
    let mut rand_bytes = [0u8; 16];
    let id = match getrandom::getrandom(&mut rand_bytes) {
        Ok(()) => format!("req-{}", to_hex(&rand_bytes)),
        Err(_) => format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed)),
    };
    log::info!("[approval] {} requested tool={} correlation={}", format.runtime(), tool_name, correlation);
    let (tx, rx) = channel::<String>();
    if let Ok(mut map) = pending.lock() {
        map.insert(id.clone(), tx);
    }

    let _ = app.emit(
        "permission-request",
        PermissionRequest {
            id: id.clone(),
            correlation,
            runtime: format.runtime().to_string(),
            tool_name,
            tool_input,
        },
    );

    // Block until resolve_approval delivers a decision (or 10 min elapses → deny).
    let decision = rx.recv_timeout(Duration::from_secs(600)).unwrap_or_else(|_| "deny".to_string());
    log::info!("[approval] {} resolved → {}", format.runtime(), decision);
    if let Ok(mut map) = pending.lock() {
        map.remove(&id);
    }
    let _ = request.respond(tiny_http::Response::from_string(hook_decision_json(format, &decision)));
}

/// Bind the loopback server on an ephemeral port and serve each request on its own
/// thread (so one parked approval can't block decisions for a concurrent run).
fn start_approval_server(app: tauri::AppHandle, pending: Pending) -> Result<u16, String> {
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            let pending = pending.clone();
            std::thread::spawn(move || handle_approval_request(request, app, pending));
        }
    });
    Ok(port)
}

/// The loopback approval-server port, for the webview to bake into the hook command.
/// 0 means the server failed to start (approvals fall back to the policy allowlist).
#[tauri::command]
fn approval_port(state: tauri::State<ApprovalState>) -> u16 {
    state.port
}

/// Deliver a user's decision ("allow" | "allow-session" | "deny") to the parked hook
/// request `id`. A missing id (already resolved, or timed out) is a no-op, not an error.
#[tauri::command]
fn resolve_approval(state: tauri::State<ApprovalState>, id: String, decision: String) -> Result<(), String> {
    let sender = state.pending.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(tx) = sender {
        let normalized = match decision.as_str() {
            "allow" | "allow-session" => decision,
            _ => "deny".to_string(),
        };
        let _ = tx.send(normalized);
    }
    Ok(())
}

// ---- Hook-file management for hermes & cursor ----
//
// Unlike claude-code (a clean per-run `--settings` hook), hermes and cursor-agent only
// read hooks from files in the user's home: hermes `~/.hermes/config.yaml` (a
// `pre_tool_call` hook) and cursor `~/.cursor/hooks.json` (a `beforeShellExecution`
// hook). We install a tiny per-runtime forwarding script and reference it from those
// files, MERGING into existing config rather than clobbering it. Installs are ref-counted
// so a run finishing doesn't tear down a hook another concurrent run still needs; our
// entry is removed only when the last run using it ends.
//
// NOTE: the exact cursor `hooks.json` schema and hermes hook-entry shape should be
// validated against the installed CLI versions; adjust the templates below if they differ.

/// Per-runtime install ref-counts (so concurrent runs share one installed hook).
fn hook_refs() -> &'static Mutex<HashMap<String, u32>> {
    static REFS: std::sync::OnceLock<Mutex<HashMap<String, u32>>> = std::sync::OnceLock::new();
    REFS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Path of the per-runtime forwarding script under app-data.
fn hook_script_path(app: &tauri::AppHandle, runtime: &str) -> Result<PathBuf, String> {
    Ok(data_dir(app).ok_or("no app data dir")?.join("hooks").join(format!("starship-hook-{runtime}.sh")))
}

/// Write (idempotently) the per-runtime forwarding script with the live port baked in.
/// It reads the hook event on stdin, tags it with the inherited dispatch id, and POSTs to
/// the loopback server; the server's response becomes the script's stdout (the decision).
fn write_hook_script(app: &tauri::AppHandle, runtime: &str, port: u16) -> Result<PathBuf, String> {
    let path = hook_script_path(app, runtime)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let script = format!(
        "#!/bin/sh\n# Starship desktop approval hook ({runtime}). Auto-generated; do not edit.\nexec curl -sS --max-time 600 -X POST -H \"X-Starship-Dispatch: ${{STARSHIP_DISPATCH_ID:-}}\" --data-binary @- \"http://127.0.0.1:{port}/hook/{runtime}\"\n"
    );
    fs::write(&path, script).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
    }
    Ok(path)
}

/// Add (or remove) our `pre_tool_call` entry in `~/.hermes/config.yaml`, preserving any
/// existing user config. Our entry is identified by its command == the script path.
fn set_hermes_hook(app: &tauri::AppHandle, script: &Path, enable: bool) -> Result<(), String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let path = home.join(".hermes").join("config.yaml");
    let script_str = script.to_string_lossy().to_string();

    let mut root: serde_yaml::Value = if path.exists() {
        serde_yaml::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .unwrap_or_else(|_| serde_yaml::Value::Mapping(Default::default()))
    } else {
        serde_yaml::Value::Mapping(Default::default())
    };
    if !root.is_mapping() {
        root = serde_yaml::Value::Mapping(Default::default());
    }
    let s = |k: &str| serde_yaml::Value::String(k.to_string());

    let map = root.as_mapping_mut().ok_or("hermes config not a mapping")?;
    if enable && !map.get(&s("hooks")).map(|v| v.is_mapping()).unwrap_or(false) {
        map.insert(s("hooks"), serde_yaml::Value::Mapping(Default::default()));
    }
    if let Some(hooks) = map.get_mut(&s("hooks")).and_then(|v| v.as_mapping_mut()) {
        if enable && !hooks.get(&s("pre_tool_call")).map(|v| v.is_sequence()).unwrap_or(false) {
            hooks.insert(s("pre_tool_call"), serde_yaml::Value::Sequence(Vec::new()));
        }
        if let Some(seq) = hooks.get_mut(&s("pre_tool_call")).and_then(|v| v.as_sequence_mut()) {
            seq.retain(|e| e.get("command").and_then(|c| c.as_str()) != Some(script_str.as_str()));
            if enable {
                let mut entry = serde_yaml::Mapping::new();
                entry.insert(s("command"), serde_yaml::Value::String(script_str.clone()));
                // Exceed the approval server's 600s deny timeout so the server drives the timeout,
                // not Hermes killing the hook mid-wait and stranding the open dialog.
                entry.insert(s("timeout"), serde_yaml::Value::Number(601.into()));
                seq.push(serde_yaml::Value::Mapping(entry));
            }
            if seq.is_empty() {
                hooks.remove(&s("pre_tool_call"));
            }
        }
        if hooks.is_empty() {
            map.remove(&s("hooks"));
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_yaml::to_string(&root).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

/// Add (or remove) our `beforeShellExecution` entry in `~/.cursor/hooks.json`, preserving
/// existing user config. Our entry is identified by its command == the script path.
fn set_cursor_hook(app: &tauri::AppHandle, script: &Path, enable: bool) -> Result<(), String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let path = home.join(".cursor").join("hooks.json");
    let script_str = script.to_string_lossy().to_string();

    let mut root: serde_json::Value = if path.exists() {
        serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let obj = root.as_object_mut().ok_or("cursor hooks not an object")?;
    obj.entry("version").or_insert(serde_json::json!(1));
    let hooks = obj.entry("hooks").or_insert(serde_json::json!({}));
    if !hooks.is_object() {
        *hooks = serde_json::json!({});
    }
    let hooks_obj = hooks.as_object_mut().ok_or("cursor hooks block not an object")?;
    let arr = hooks_obj.entry("beforeShellExecution").or_insert(serde_json::json!([]));
    if !arr.is_array() {
        *arr = serde_json::json!([]);
    }
    let list = arr.as_array_mut().ok_or("cursor hook list not an array")?;
    list.retain(|e| e.get("command").and_then(|c| c.as_str()) != Some(script_str.as_str()));
    if enable {
        // Match the hermes hook: exceed the approval server's 600s deny timeout so the server
        // drives the timeout. Harmless if Cursor ignores an unknown field.
        list.push(serde_json::json!({ "command": script_str, "timeout": 601 }));
    }
    if list.is_empty() {
        hooks_obj.remove("beforeShellExecution");
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

/// Install (`enable=true`) or release (`enable=false`) the file-based hook for a runtime
/// ("hermes" | "cursor"). Ref-counted: the hook file entry is added on the first install
/// and removed only when the last user releases it. Best-effort; surfaces errors to the UI.
#[tauri::command]
fn set_runtime_hook(app: tauri::AppHandle, runtime: String, port: u16, enable: bool) -> Result<(), String> {
    if runtime != "hermes" && runtime != "cursor" {
        return Err(format!("unsupported hook runtime: {runtime}"));
    }
    let remaining = {
        let mut refs = hook_refs().lock().map_err(|e| e.to_string())?;
        let c = refs.entry(runtime.clone()).or_insert(0);
        if enable {
            *c += 1;
        } else if *c > 0 {
            *c -= 1;
        }
        *c
    };

    if enable {
        let script = write_hook_script(&app, &runtime, port)?;
        match runtime.as_str() {
            "hermes" => set_hermes_hook(&app, &script, true),
            "cursor" => set_cursor_hook(&app, &script, true),
            _ => Ok(()),
        }
    } else if remaining == 0 {
        let script = hook_script_path(&app, &runtime)?;
        match runtime.as_str() {
            "hermes" => set_hermes_hook(&app, &script, false),
            "cursor" => set_cursor_hook(&app, &script, false),
            _ => Ok(()),
        }
    } else {
        Ok(())
    }
}

// ---- Per-run claude settings file ----
//
// claude-code only loads hooks from settings FILES, not from inline `--settings` JSON. So
// for each gated claude run we write a throwaway settings file (with the PreToolUse hook +
// a `default` permission mode that overrides any bypass in the user's own settings) and pass
// it via `--settings <path>`. The webview builds the JSON (it knows the port + dispatchId);
// we just persist it owner-only and hand back the path, then delete it when the run ends.

/// Write a per-run claude settings file and return its absolute path.
#[tauri::command]
fn write_run_settings(app: tauri::AppHandle, dispatch_id: String, contents: String) -> Result<String, String> {
    if !valid_id(&dispatch_id) {
        return Err("invalid dispatch id".into());
    }
    let dir = data_dir(&app).ok_or("no app data dir")?.join("hooks");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("claude-{dispatch_id}.json"));
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    set_owner_only(&path);
    Ok(path.to_string_lossy().to_string())
}

/// Delete a per-run claude settings file (idempotent).
#[tauri::command]
fn remove_run_settings(app: tauri::AppHandle, dispatch_id: String) -> Result<(), String> {
    if !valid_id(&dispatch_id) {
        return Err("invalid dispatch id".into());
    }
    let path = data_dir(&app).ok_or("no app data dir")?.join("hooks").join(format!("claude-{dispatch_id}.json"));
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
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
    cwd: Option<String>,
    on_event: Channel<StreamMsg>,
) -> Result<RunResult, String> {
    let started = Instant::now();
    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .envs(&env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Run inside the chosen working directory so the CLI sees the right project; an empty
    // string means "no choice", so fall through to the app process cwd.
    if let Some(dir) = cwd.as_deref().filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }
    let mut child = cmd
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
    cwd: Option<String>,
    on_event: Channel<StreamMsg>,
) -> Result<RunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_agent_blocking(command, args, env, cwd, on_event))
        .await
        .map_err(|e| e.to_string())?
}

// ---- Duplex (bidirectional) process runs, for codex app-server ----
//
// codex has no hook; it's driven over `codex app-server` JSON-RPC on stdio, where the
// approval reply goes back on the process's OWN stdin. So unlike run_agent (stdin null),
// this keeps stdin piped and registers the handle by `run_id` so `send_agent_input` can
// write JSON-RPC frames to it mid-run. stdout/stderr stream the same way as run_agent.

/// Live duplex process stdins, keyed by run_id (the webview's dispatchId).
fn duplex_stdins() -> &'static Mutex<HashMap<String, std::process::ChildStdin>> {
    static STDINS: std::sync::OnceLock<Mutex<HashMap<String, std::process::ChildStdin>>> = std::sync::OnceLock::new();
    STDINS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn run_agent_duplex_blocking(
    run_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: Option<String>,
    on_event: Channel<StreamMsg>,
) -> Result<RunResult, String> {
    let started = Instant::now();
    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .envs(&env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd.as_deref().filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("could not start {command}: {e}"))?;

    log::info!("[codex-io] spawned {command} {args:?}");
    let stdin = child.stdin.take().expect("piped stdin");
    if let Ok(mut map) = duplex_stdins().lock() {
        map.insert(run_id.clone(), stdin);
    }
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

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

    // Drop the stdin handle so a stuck writer can't keep the child alive.
    if let Ok(mut map) = duplex_stdins().lock() {
        map.remove(&run_id);
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let exit_code = status.code();
    let duration_ms = started.elapsed().as_millis() as u64;
    log::info!("[codex-io] exited code={exit_code:?} after {duration_ms}ms");
    let _ = on_event.send(StreamMsg::Exit { exit_code, duration_ms });
    Ok(RunResult { exit_code, duration_ms })
}

/// Spawn a duplex process (piped stdin) and stream it. `run_id` keys the stdin handle for
/// `send_agent_input`. Used for codex app-server; see codexClient.ts.
#[tauri::command]
async fn run_agent_duplex(
    run_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: Option<String>,
    on_event: Channel<StreamMsg>,
) -> Result<RunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_agent_duplex_blocking(run_id, command, args, env, cwd, on_event))
        .await
        .map_err(|e| e.to_string())?
}

/// Write a line to a duplex run's stdin (a JSON-RPC frame for codex app-server). A trailing
/// newline is added if absent (the protocol is newline-delimited JSON). Errors if the run
/// isn't live (already exited).
#[tauri::command]
fn send_agent_input(run_id: String, data: String) -> Result<(), String> {
    use std::io::Write;
    let mut map = duplex_stdins().lock().map_err(|e| e.to_string())?;
    let stdin = map.get_mut(&run_id).ok_or("no such run")?;
    stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    if !data.ends_with('\n') {
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Close a duplex run's stdin (drop the handle → EOF). `codex app-server` is a persistent
/// server that won't exit on its own; closing stdin lets it shut down so the run resolves.
/// No-op if the run already ended.
#[tauri::command]
fn close_agent_input(run_id: String) -> Result<(), String> {
    duplex_stdins().lock().map_err(|e| e.to_string())?.remove(&run_id);
    Ok(())
}

// ---- API-key secrets (encrypted file + keychain master key) ----
//
// BYO provider keys are stored as a single AES-256-GCM ciphertext at `config/secrets.enc`.
// The 32-byte master key that encrypts them lives in the OS keychain (Keychain / Credential
// Manager / Secret Service) via the `keyring` crate, so the secret bytes never touch disk in
// the clear and the webview never sees them. The webview can set/delete a key and read its
// presence + last-4 hint, but never the secret itself; the decrypted key reaches the
// agent-runtime sidecar only as an env var injected at spawn (below). Only the two providers
// we support today are valid.

const KEYRING_SERVICE: &str = "ai.starships.agent.runtime";
/// Keychain account holding the hex-encoded 32-byte master key for `secrets.enc`.
const MASTER_KEY_ACCOUNT: &str = "master-key";

fn valid_provider(provider: &str) -> bool {
    provider == "anthropic" || provider == "openai"
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("bad hex length".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

/// Fetch (or lazily create) the 32-byte master key. It lives hex-encoded in the OS keychain;
/// only the ciphertext it protects is ever written to disk.
fn master_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, MASTER_KEY_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(hex) => from_hex(&hex)?
            .as_slice()
            .try_into()
            .map_err(|_| "master key has wrong length".to_string()),
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            getrandom::getrandom(&mut key).map_err(|e| e.to_string())?;
            entry.set_password(&to_hex(&key)).map_err(|e| e.to_string())?;
            Ok(key)
        }
        Err(e) => Err(e.to_string()),
    }
}

fn secrets_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("secrets.enc"))
}

/// Decrypt the provider-key map from `secrets.enc`. An absent file is an empty map; a
/// present-but-undecryptable file is a hard error (corruption or a lost/rotated master key).
fn read_secrets_map(app: &tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let blob = match fs::read(secrets_file(app)?) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
        Err(e) => return Err(e.to_string()),
    };
    if blob.len() < 12 {
        return Err("secrets file is truncated".into());
    }
    let (nonce, ct) = blob.split_at(12);
    let key = master_key()?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| "could not decrypt secrets".to_string())?;
    serde_json::from_slice(&plain).map_err(|e| e.to_string())
}

/// Encrypt + atomically write the provider-key map to `secrets.enc` (0600). The 12-byte
/// random nonce is prepended to the ciphertext.
fn write_secrets_map(app: &tauri::AppHandle, map: &BTreeMap<String, String>) -> Result<(), String> {
    let plain = serde_json::to_vec(map).map_err(|e| e.to_string())?;
    let key = master_key()?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let mut nonce = [0u8; 12];
    getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_ref())
        .map_err(|_| "could not encrypt secrets".to_string())?;
    let mut blob = Vec::with_capacity(nonce.len() + ct.len());
    blob.extend_from_slice(&nonce);
    blob.extend_from_slice(&ct);

    let path = secrets_file(app)?;
    let tmp = path.with_extension("enc.tmp");
    fs::write(&tmp, &blob).map_err(|e| e.to_string())?;
    set_owner_only(&tmp);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read one decrypted key (None if absent). Used internally to populate the sidecar env.
fn read_secret(app: &tauri::AppHandle, provider: &str) -> Option<String> {
    read_secrets_map(app)
        .ok()
        .and_then(|m| m.get(provider).cloned())
        .filter(|s| !s.is_empty())
}

/// Store a provider key, then restart the runtime sidecar so it picks up the new env.
#[tauri::command]
fn set_secret(app: tauri::AppHandle, provider: String, key: String) -> Result<(), String> {
    if !valid_provider(&provider) {
        return Err(format!("unknown provider: {provider}"));
    }
    if key.trim().is_empty() {
        return Err("empty key".into());
    }
    let mut map = read_secrets_map(&app)?;
    map.insert(provider, key.trim().to_string());
    write_secrets_map(&app, &map)?;
    restart_runtime(&app);
    Ok(())
}

/// Delete a provider key (idempotent), then restart the runtime sidecar.
#[tauri::command]
fn delete_secret(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    if !valid_provider(&provider) {
        return Err(format!("unknown provider: {provider}"));
    }
    let mut map = read_secrets_map(&app)?;
    if map.remove(&provider).is_some() {
        write_secrets_map(&app, &map)?;
    }
    restart_runtime(&app);
    Ok(())
}

/// Presence + masked hint per provider (never the secret). Drives the Settings UI.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretStatus {
    provider: String,
    present: bool,
    hint: String,
}

#[tauri::command]
fn secret_status(app: tauri::AppHandle) -> Vec<SecretStatus> {
    let map = read_secrets_map(&app).unwrap_or_default();
    ["anthropic", "openai"]
        .iter()
        .map(|p| {
            let val = map.get(*p).filter(|s| !s.is_empty());
            let hint = val
                .map(|v| if v.len() >= 4 { format!("…{}", &v[v.len() - 4..]) } else { "…".to_string() })
                .unwrap_or_default();
            SecretStatus { provider: p.to_string(), present: val.is_some(), hint }
        })
        .collect()
}

// ---- agent-runtime sidecar lifecycle ----
//
// Our in-house runtime (@starships/agent-runtime) runs as a local HTTP+SSE service the
// webview talks to over fetch. We spawn it here so we can inject the keychain keys into its
// env (the webview never sees them), read the port it prints on stdout, and keep the child
// alive. On a key change we restart it so the new env takes effect. In a release bundle the
// runtime ships as an externalBin next to the app; in dev we run the built JS with node.

struct RuntimeState {
    child: Mutex<Option<std::process::Child>>,
    port: Mutex<u16>,
}

/// Find a prebuilt `starship-runtime*` standalone binary in `dir` (any target-triple suffix).
fn find_bundled_binary(dir: &Path) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        let is_bin = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("starship-runtime"))
            .unwrap_or(false);
        if is_bin && path.is_file() {
            return Some(path);
        }
    }
    None
}

/// (program, args, cwd) used to launch the runtime sidecar.
///
/// Preference order: an explicit `STARSHIP_RUNTIME_CMD` override → a prebuilt standalone
/// binary (needs no node) next to the app exe or in src-tauri/binaries → `node` running the
/// built JS (dev fallback; `node` is resolved to an absolute path so a GUI launch without a
/// shell PATH still finds it).
fn runtime_spawn_cmd(app: &tauri::AppHandle) -> (String, Vec<String>, Option<PathBuf>) {
    let cwd = app.path().home_dir().ok();

    if let Ok(cmd) = std::env::var("STARSHIP_RUNTIME_CMD") {
        if !cmd.trim().is_empty() {
            return (cmd, Vec::new(), cwd);
        }
    }

    // Prefer a standalone binary: next to the executable (release) or in src-tauri/binaries (dev).
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.to_path_buf());
        }
    }
    dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries"));
    for dir in &dirs {
        if let Some(bin) = find_bundled_binary(dir) {
            return (bin.to_string_lossy().to_string(), Vec::new(), cwd);
        }
    }

    // Dev fallback: node + the package's built entry. Resolve node to an absolute path.
    let entry = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("agent-runtime")
        .join("dist")
        .join("server.js");
    let node = which::which("node")
        .ok()
        .or_else(|| {
            // Common install locations a GUI launch might miss (homebrew, system).
            ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
                .iter()
                .map(PathBuf::from)
                .find(|p| p.exists())
        })
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "node".to_string());
    (node, vec![entry.to_string_lossy().to_string()], cwd)
}

/// Start the sidecar if it isn't running; return its port. Blocks briefly to read the
/// `RUNTIME_LISTENING {"port":N}` handshake the service prints on stdout at boot.
fn start_runtime(app: &tauri::AppHandle, state: &RuntimeState) -> Result<u16, String> {
    // Serialize the whole check-and-spawn: restart_runtime() (called from set_secret/delete_secret
    // on the async thread pool) can race a webview-triggered runtime_base_url(). Without one guard
    // both callers pass the liveness gate at port==0, spawn two sidecars, and the first child's
    // handle is overwritten on state update — orphaning a running process on an unknown port. Held
    // for the rest of the function, so the liveness re-check below also runs inside the lock.
    static SPAWN_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
    let _spawn_guard = SPAWN_LOCK.get_or_init(|| Mutex::new(())).lock().map_err(|e| e.to_string())?;
    {
        let port = *state.port.lock().map_err(|e| e.to_string())?;
        // try_wait() is non-blocking: None = still running, Some(_) = already exited. Checking
        // only is_some() would treat a crashed-but-not-reaped child as alive and hand back a
        // dead port, so the first request fails with "connection refused" instead of respawning.
        let alive = state
            .child
            .lock()
            .map_err(|e| e.to_string())?
            .as_mut()
            .map(|c| c.try_wait().ok().flatten().is_none())
            .unwrap_or(false);
        if port > 0 && alive {
            return Ok(port);
        }
    }

    let (program, args, cwd) = runtime_spawn_cmd(app);
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .env("PORT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }
    if let Some(k) = read_secret(app, "anthropic") {
        cmd.env("ANTHROPIC_API_KEY", k);
    }
    if let Some(k) = read_secret(app, "openai") {
        cmd.env("OPENAI_API_KEY", k);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("could not start runtime ({program}): {e}"))?;
    let stdout = child.stdout.take().ok_or("runtime stdout missing")?;

    // Capture stderr concurrently so a startup crash (e.g. a missing module) is visible in
    // logs AND can be surfaced in the error if the handshake never arrives.
    let err_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    if let Some(stderr) = child.stderr.take() {
        let eb = err_buf.clone();
        std::thread::spawn(move || {
            for l in BufReader::new(stderr).lines().map_while(Result::ok) {
                log::info!("[runtime:err] {l}");
                if let Ok(mut b) = eb.lock() {
                    b.push_str(&l);
                    b.push('\n');
                }
            }
        });
    }

    // Read stdout on a thread: report the handshake port once, then keep draining (so the
    // pipe never fills). EOF/error before the handshake reports None.
    let (tx, rx) = channel::<Option<u16>>();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut reported = false;
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => {
                    if !reported {
                        let _ = tx.send(None);
                    }
                    break;
                }
                Ok(_) => {
                    if !reported {
                        if let Some(rest) = line.trim().strip_prefix("RUNTIME_LISTENING ") {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(rest) {
                                if let Some(p) = v.get("port").and_then(|p| p.as_u64()) {
                                    let _ = tx.send(Some(p as u16));
                                    reported = true;
                                    continue;
                                }
                            }
                        }
                    }
                    log::info!("[runtime] {}", line.trim());
                }
            }
        }
    });

    let port = match rx.recv_timeout(Duration::from_secs(15)) {
        Ok(Some(p)) => p,
        _ => {
            let _ = child.kill();
            let tail = err_buf
                .lock()
                .map(|b| b.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"))
                .unwrap_or_default();
            return Err(format!(
                "runtime ({program}) did not start{}",
                if tail.is_empty() { String::new() } else { format!(":\n{tail}") }
            ));
        }
    };

    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    *state.port.lock().map_err(|e| e.to_string())? = port;
    log::info!("[runtime] agent-runtime sidecar on http://127.0.0.1:{port}");
    Ok(port)
}

/// Kill the running sidecar (if any) and reset the port.
fn stop_runtime(state: &RuntimeState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut p) = state.port.lock() {
        *p = 0;
    }
}

/// Restart the sidecar (after a key change) so the new env is in effect. Best-effort.
fn restart_runtime(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        stop_runtime(&state);
        if let Err(e) = start_runtime(app, &state) {
            log::warn!("[runtime] restart failed (will retry on next use): {e}");
        }
    }
}

/// Base URL of the runtime sidecar, starting it lazily on first use.
#[tauri::command]
fn runtime_base_url(app: tauri::AppHandle, state: tauri::State<RuntimeState>) -> Result<String, String> {
    let port = start_runtime(&app, &state)?;
    Ok(format!("http://127.0.0.1:{port}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Start the loopback approval back-channel and stash its port + pending map.
            let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
            let port = match start_approval_server(app.handle().clone(), pending.clone()) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("approval server failed to start: {e}");
                    0
                }
            };
            app.manage(ApprovalState { port, pending });
            log::info!("[approval] loopback hook server on http://127.0.0.1:{port}");
            // The agent-runtime sidecar is started lazily on first use (runtime_base_url),
            // so a missing node / unbuilt package can't block app startup.
            app.manage(RuntimeState { child: Mutex::new(None), port: Mutex::new(0) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_agents,
            read_store,
            write_store,
            list_personas,
            write_persona,
            delete_persona,
            list_runtimes,
            write_runtime,
            delete_runtime,
            list_conversations,
            read_conversation,
            create_conversation,
            append_conversation,
            update_conversation_meta,
            delete_conversation,
            append_event,
            read_events,
            read_agent_transcript,
            run_agent,
            run_agent_duplex,
            send_agent_input,
            close_agent_input,
            approval_port,
            resolve_approval,
            set_runtime_hook,
            write_run_settings,
            remove_run_settings,
            set_secret,
            delete_secret,
            secret_status,
            runtime_base_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
