import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  addHeartbeat,
  addPersona,
  addRuntime,
  deleteHeartbeat,
  deletePersona,
  eventsForPersona,
  getStore,
  initStore,
  removeRuntime,
  updateHeartbeat,
  updatePersona,
  useStore,
  type AgentEvent,
  type Heartbeat,
  type Persona,
  type Runtime,
  type RuntimeKind,
} from './store';
import {
  addConversation,
  appendConversationMessages,
  deleteConversation,
  initConversations,
  updateConversationTitle,
  useConversation,
  useConversations,
  type Conversation as ConversationRecord,
} from './conversations';
import { runConversationTurn, runPersona } from './engine';
import { Markdown } from './markdown';
import { detectAgents, hostname, isFullscreen, isTauri, readAgentTranscript, watchFullscreen, type DetectedAgent } from './tauri';
import { parseClaudeTranscript, type TranscriptTurn, type TurnRole } from './transcript';
import { Onboarding } from './Onboarding';
import { COMMON_TOOLS, DEFAULT_PERMISSIONS, SUPPORTS_ALLOWLIST, type PermissionPolicy } from './permissions';
import { useLiveRun, type LiveRun } from './liveRuns';

const KIND_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  custom: 'Custom',
};
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

/** Poll cadence for the in-app heartbeat scheduler (runs only while the app is open). */
const SCHEDULER_TICK_MS = 20_000;

export default function App() {
  const [booting, setBooting] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    Promise.all([initStore(), initConversations()]).finally(() => setBooting(false));
  }, []);

  // In-app heartbeat scheduler: fire any due, enabled heartbeats. Because this
  // lives in the app process, schedules only advance while the app is running.
  useEffect(() => {
    if (booting) return;
    const tick = () => {
      const store = getStore();
      const nowMs = Date.now();
      for (const h of store.heartbeats) {
        if (!h.enabled) continue;
        if (new Date(h.nextFireAt).getTime() > nowMs) continue;
        // Advance the schedule first so a long run can't double-fire on the next tick.
        updateHeartbeat(h.id, { lastFiredAt: new Date().toISOString(), nextFireAt: new Date(nowMs + h.intervalSeconds * 1000).toISOString() });
        void runPersona(h.personaId, h.prompt).catch((err) => console.error('[heartbeat] run failed for', h.id, ':', err));
      }
    };
    const id = setInterval(tick, SCHEDULER_TICK_MS);
    return () => clearInterval(id);
  }, [booting]);

  const store = useStore();

  if (booting) {
    return (
      <div className="flex min-h-full flex-col">
        <TitleBar />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
          <h1 className="text-xl font-semibold">Starship Agent</h1>
          <p className="muted">Starting…</p>
        </div>
        <Style />
      </div>
    );
  }

  if (!store.onboardedAt) return <Onboarding />;

  return <Dashboard />;
}

type Tab = 'chat' | 'runtime' | 'personas' | 'heartbeats' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'runtime', label: 'Runtimes' },
  { id: 'personas', label: 'Personas' },
  { id: 'heartbeats', label: 'Heartbeats' },
  { id: 'activity', label: 'Activity' },
];

/**
 * Stands in for the native title bar: a draggable strip that keeps the window
 * movable while the macOS traffic lights sit inside the app (the window uses
 * `titleBarStyle: Overlay`), the way Claude's desktop app does. The height clears
 * the overlaid window controls so app content never hides behind them.
 */
export function TitleBar() {
  return <div data-tauri-drag-region className="h-9 shrink-0" />;
}

/** Tracks macOS fullscreen, where the traffic lights are hidden and their
 *  reserved space can be reclaimed. Always false outside the Tauri shell. */
function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void isFullscreen().then(setFullscreen);
    void watchFullscreen(setFullscreen).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, []);
  return fullscreen;
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>('chat');
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSelection, setChatSelection] = useState<string | null>(null);
  const fullscreen = useFullscreen();

  // ⌘K / Ctrl+K opens the search palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openConversation = (id: string) => {
    setChatSelection(id);
    setTab('chat');
    setSearchOpen(false);
  };

  // App shell: a floating nav sidebar beside a flush content area. There's no
  // separate title band — the macOS traffic lights overlay the sidebar's own top
  // inset (Claude-style), so the nav sits right under them with no empty gap. The
  // sidebar collapses; its top toolbar and the content strip stay draggable.
  return (
    <div className="flex h-full">
      {collapsed ? null : (
        <Sidebar tab={tab} setTab={setTab} fullscreen={fullscreen} onCollapse={() => setCollapsed(true)} onSearch={() => setSearchOpen(true)} />
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopStrip collapsed={collapsed} fullscreen={fullscreen} onExpand={() => setCollapsed(false)} onSearch={() => setSearchOpen(true)} />
        {tab === 'chat' ? (
          <ChatTab selectedId={chatSelection} onSelect={setChatSelection} />
        ) : tab === 'runtime' ? (
          <RuntimeTab />
        ) : tab === 'personas' ? (
          <PersonasTab />
        ) : tab === 'heartbeats' ? (
          <HeartbeatsTab />
        ) : (
          <ActivityTab />
        )}
      </main>

      {searchOpen ? (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          onOpenConversation={openConversation}
          onGoTab={(t) => {
            setTab(t);
            setSearchOpen(false);
          }}
        />
      ) : null}

      <Style />
    </div>
  );
}

/** Compact line icon for each nav tab (feather-style, inherits text color). */
function TabIcon({ id }: { id: Tab }) {
  const paths: Record<Tab, ReactNode> = {
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    runtime: (
      <>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </>
    ),
    personas: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    heartbeats: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    activity: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
  };
  return (
    <svg
      className="h-4 w-4 shrink-0 opacity-80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[id]}
    </svg>
  );
}

/**
 * Floating navigation sidebar: a rounded card inset from the window edges. The
 * macOS traffic lights are repositioned (see `trafficLightPosition` in
 * tauri.conf.json) to sit inside its draggable top inset, so they don't clip the
 * floating corner. Compact icon + label rows with a soft rounded selection,
 * matching the Claude-desktop sidebar; narrows on small windows.
 */
function Sidebar({
  tab,
  setTab,
  fullscreen,
  onCollapse,
  onSearch,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  fullscreen: boolean;
  onCollapse: () => void;
  onSearch: () => void;
}) {
  return (
    <aside className="m-1.5 flex w-44 shrink-0 flex-col overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-2 pb-2 pt-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)] sm:w-52 lg:mr-0 lg:w-60">
      {/* Top toolbar: a drag spacer the traffic lights overlay, then the collapse
          and search controls — like Claude's sidebar header. Top inset is m-1.5 +
          pt-1 = 10px; left inset is m-1.5 + px-2 = 14px, so the spacer width (w-16)
          places the buttons at window-x 78; the content strip mirrors both. */}
      <div className="flex h-7 shrink-0 items-center gap-0.5">
        {/* Reserve room for the traffic lights — unless fullscreen, where they hide
            and the controls cascade left into that space. */}
        <div data-tauri-drag-region className={`h-full shrink-0 ${fullscreen ? 'w-0' : 'w-16'}`} />
        <IconButton title="Collapse sidebar" onClick={onCollapse}>
          <SidebarIcon />
        </IconButton>
        <IconButton title="Search (⌘K)" onClick={onSearch}>
          <SearchIcon />
        </IconButton>
        <div data-tauri-drag-region className="h-full flex-1" />
      </div>
      <nav className="mt-3 flex flex-col gap-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-[13px] tracking-tight transition-colors ${
              tab === t.id ? 'bg-(--color-accent-soft) text-(--color-fg)' : 'text-(--color-fg-muted) hover:bg-(--color-accent-soft) hover:text-(--color-fg)'
            }`}
          >
            <TabIcon id={t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

/** Small square icon button used in the sidebar/content toolbars. */
function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--color-fg-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-(--color-fg)"
    >
      {children}
    </button>
  );
}

function SidebarIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * Draggable strip above the content area. The top pad mirrors the sidebar's
 * margin + padding so this row lines up vertically with the sidebar's toolbar (and
 * the overlaid traffic lights) in both states. When the sidebar is collapsed it
 * also carries the expand + search controls, offset horizontally past the lights
 * to the same x as the sidebar's controls.
 */
function TopStrip({
  collapsed,
  fullscreen,
  onExpand,
  onSearch,
}: {
  collapsed: boolean;
  fullscreen: boolean;
  onExpand: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      {/* Top pad = sidebar's 10px top inset (m-1.5 + pt-1), so this row sits at the
          same window-y as the sidebar toolbar and the traffic lights. */}
      <div data-tauri-drag-region className="h-2.5 w-full" />
      <div className="flex h-7 items-center gap-0.5">
        {collapsed ? (
          <>
            {/* 78px = sidebar inset (14) + sidebar spacer (w-16 = 64); collapses to
                a left edge when fullscreen hides the traffic lights. */}
            <div data-tauri-drag-region className={`h-full shrink-0 ${fullscreen ? 'w-2' : 'w-[78px]'}`} />
            <IconButton title="Expand sidebar" onClick={onExpand}>
              <SidebarIcon />
            </IconButton>
            <IconButton title="Search (⌘K)" onClick={onSearch}>
              <SearchIcon />
            </IconButton>
            <div data-tauri-drag-region className="h-full flex-1" />
          </>
        ) : (
          <div data-tauri-drag-region className="h-full w-full" />
        )}
      </div>
    </div>
  );
}

type SearchResult = { kind: 'chat' | 'tab'; id: string; label: string; sub: string };

/**
 * Command palette (⌘K): fuzzy-ish search across conversations and pages. Selecting
 * a conversation opens it in the Chat tab; selecting a page navigates there.
 */
function SearchPalette({
  onClose,
  onOpenConversation,
  onGoTab,
}: {
  onClose: () => void;
  onOpenConversation: (id: string) => void;
  onGoTab: (t: Tab) => void;
}) {
  const store = useStore();
  const conversations = useConversations();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const personaName = (id: string) => store.personas.find((p) => p.id === id)?.name ?? 'Unknown persona';
  const ql = q.trim().toLowerCase();

  const convoResults: SearchResult[] = [...conversations]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter((c) => !ql || c.title.toLowerCase().includes(ql) || personaName(c.personaId).toLowerCase().includes(ql))
    .slice(0, 8)
    .map((c) => ({ kind: 'chat', id: c.id, label: c.title, sub: personaName(c.personaId) }));

  const tabResults: SearchResult[] = TABS.filter((t) => !ql || t.label.toLowerCase().includes(ql)).map((t) => ({
    kind: 'tab',
    id: t.id,
    label: t.label,
    sub: 'Page',
  }));

  const results = [...convoResults, ...tabResults];
  const clamped = Math.min(active, Math.max(0, results.length - 1));

  const choose = (r: SearchResult | undefined) => {
    if (!r) return;
    if (r.kind === 'chat') onOpenConversation(r.id);
    else onGoTab(r.id as Tab);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev) shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[clamped]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Search chats and pages…"
          className="w-full border-b border-(--color-border) bg-transparent px-4 py-3 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-subtle)"
        />
        {results.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {results.map((r, i) => (
              <li key={`${r.kind}:${r.id}`}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${
                    i === clamped ? 'bg-(--color-accent-soft) text-(--color-fg)' : 'text-(--color-fg-muted)'
                  }`}
                >
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-(--color-fg-subtle)">{r.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted px-4 py-6 text-center text-[13px]">No matches.</div>
        )}
      </div>
    </div>
  );
}

/**
 * The standard page shell every tab renders into. Owns the scroll region, padding,
 * and a centered max-width column, plus an optional title/count/action/description
 * header — so each tab only supplies its own body and the chrome stays consistent.
 */
const PAGE_WIDTHS = {
  // Full literal class names so Tailwind's scanner picks them up.
  normal: 'max-w-4xl',
  narrow: 'max-w-3xl',
} as const;

function Page({
  title,
  count,
  description,
  action,
  width = 'normal',
  children,
}: {
  title?: string;
  count?: number;
  description?: ReactNode;
  action?: ReactNode;
  width?: keyof typeof PAGE_WIDTHS;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
      <div className={`mx-auto flex w-full flex-col gap-3 ${PAGE_WIDTHS[width]}`}>
        {title != null ? (
          <div className="flex items-center justify-between gap-2">
            <h2 className="section mb-0">
              {title}
              {count != null ? ` (${count})` : ''}
            </h2>
            {action}
          </div>
        ) : null}
        {description != null ? <p className="muted text-[11px]">{description}</p> : null}
        {children}
      </div>
    </div>
  );
}

// ---- Chat tab ----

function ChatTab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const store = useStore();
  const conversations = useConversations();
  const selected = useConversation(selectedId);

  if (selectedId) {
    if (!selected) return <Page title="Chat"><p className="muted text-sm">Loading conversation…</p></Page>;
    return (
      <ConversationThread
        conversation={selected}
        persona={store.personas.find((p) => p.id === selected.personaId)}
        onBack={() => onSelect(null)}
      />
    );
  }

  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const personaName = (id: string) => store.personas.find((p) => p.id === id)?.name ?? 'Unknown persona';

  return (
    <Page
      title="Chats"
      count={conversations.length}
      description="Chat with a persona in a back-and-forth thread. Each conversation keeps its own session, so follow-ups remember what was said (Claude Code; other runtimes answer each message fresh)."
    >
      <NewConversationForm personas={store.personas} onStart={(personaId) => onSelect(addConversation({ personaId, title: 'New conversation' }).id)} />

      {sorted.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((c) => (
            <li key={c.id} className="rounded-md border border-(--color-border) p-3">
              <div className="flex items-center justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onSelect(c.id)}>
                  <div className="truncate text-sm">{c.title}</div>
                  <div className="muted text-[11px]">
                    {personaName(c.personaId)} · {timeAgo(c.updatedAt)}
                  </div>
                </button>
                <button className="btn-ghost shrink-0 text-[11px] text-red-400" onClick={() => deleteConversation(c.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">No conversations yet. Start one above.</p>
      )}
    </Page>
  );
}

function NewConversationForm({ personas, onStart }: { personas: Persona[]; onStart: (personaId: string) => void }) {
  const runnable = personas.filter((p) => p.runtimeId);
  const [personaId, setPersonaId] = useState(runnable[0]?.id ?? '');

  if (personas.length === 0) return <p className="muted text-sm">Create a persona first — a conversation runs on a persona.</p>;

  return (
    <div className="flex items-end gap-2 rounded-md border border-(--color-border) p-3">
      <label className="flex flex-1 flex-col gap-1 text-[11px]">
        <span className="muted">Persona</span>
        <select className="inp text-xs" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {runnable.length === 0 ? <option value="">No persona has a runtime</option> : null}
          {personas.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.runtimeId}>
              {p.name}
              {p.runtimeId ? '' : ' (no runtime)'}
            </option>
          ))}
        </select>
      </label>
      <button className="btn text-xs" disabled={!personaId} onClick={() => onStart(personaId)}>
        New chat
      </button>
    </div>
  );
}

function ConversationThread({ conversation, persona, onBack }: { conversation: ConversationRecord; persona?: Persona; onBack: () => void }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useLiveRun(activeDispatch);
  const scrollRef = useRef<HTMLDivElement>(null);

  const noRuntime = !persona?.runtimeId;

  // Keep the newest content in view as messages land and tokens stream.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation.messages.length, live?.committed.length, live?.streamingText, live?.raw]);

  async function send() {
    const text = input.trim();
    if (!text || running || noRuntime) return;
    setInput('');
    setError(null);
    setRunning(true);
    // Show the user's message right away; the engine appends the agent's turns when it returns.
    appendConversationMessages(conversation.id, [{ role: 'user', text, at: new Date().toISOString() }]);
    if (conversation.title === 'New conversation') updateConversationTitle(conversation.id, text.slice(0, 48));
    try {
      const r = await runConversationTurn(conversation.id, text, setActiveDispatch);
      if (!r.ok) setError(`Run failed${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setActiveDispatch(null);
    }
  }

  const liveTurns = live?.status === 'running' ? live.committed : [];
  const items = groupTurns([...conversation.messages, ...liveTurns]);
  const streaming = live?.status === 'running' ? live.streamingText : '';
  const rawOnly = live?.status === 'running' && live.raw && live.committed.length === 0 && !live.streamingText ? live.raw : '';
  const empty = conversation.messages.length === 0 && !running;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-4 sm:px-6">
      <div className="flex items-center gap-3 pb-2">
        <button className="btn-ghost shrink-0 text-[11px]" onClick={onBack}>
          ← All chats
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm">{conversation.title}</div>
          {persona ? (
            <div className="muted text-[11px]">
              {persona.name}
              {persona.model ? ` · ${persona.model}` : ''}
            </div>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-1 py-5">
          {empty ? <div className="muted py-16 text-center text-sm">Send a message to start the conversation.</div> : null}
          {items.map((it, i) =>
            it.kind === 'tool' ? <ToolCard key={i} call={it.call} result={it.result} /> : <ChatMessage key={i} turn={it.turn} />
          )}
          {streaming ? <ChatMessage turn={{ role: 'assistant', text: streaming }} streaming /> : null}
          {rawOnly ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-3 font-mono text-[11px] leading-relaxed text-(--color-fg-muted)">
              {rawOnly}
            </pre>
          ) : null}
          {running && !live ? (
            <div className="flex items-center gap-2 text-[13px] text-(--color-fg-muted)">
              <span className="dot-pulse" />
              Thinking…
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl pt-2">
        {noRuntime ? <p className="muted mb-2 text-center text-[11px]">Assign this persona to a runtime (Personas tab) to chat.</p> : null}
        {error ? <p className="mb-2 text-center text-[11px] text-red-400">{error}</p> : null}
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          disabled={noRuntime}
          running={running}
          placeholder={noRuntime ? 'Assign a runtime to chat' : `Reply to ${persona?.name ?? 'agent'}…`}
        />
        <div className="muted mt-1.5 text-center text-[10px]">Runs locally on your machine. Agents can make mistakes.</div>
      </div>
    </div>
  );
}

/** One rendered chat turn: user → right bubble, assistant → full-width Markdown prose. */
function ChatMessage({ turn, streaming }: { turn: TranscriptTurn; streaming?: boolean }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-(--color-accent-soft) px-4 py-2.5 text-[15px] leading-relaxed text-(--color-fg)">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="px-0.5">
      <Markdown text={turn.text} />
      {streaming ? <span className="caret-md" /> : null}
    </div>
  );
}

type ChatItem = { kind: 'msg'; turn: TranscriptTurn } | { kind: 'tool'; call: TranscriptTurn; result?: TranscriptTurn };

/** Fold a flat turn list into render items, pairing each tool call with its following result. */
function groupTurns(turns: TranscriptTurn[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role === 'tool') {
      const next = turns[i + 1];
      if (next?.role === 'result') {
        items.push({ kind: 'tool', call: t, result: next });
        i++;
      } else {
        items.push({ kind: 'tool', call: t });
      }
    } else if (t.role === 'result') {
      items.push({ kind: 'tool', call: { role: 'tool', text: '', tool: t.tool ?? 'result' }, result: t });
    } else {
      items.push({ kind: 'msg', turn: t });
    }
  }
  return items;
}

/** A collapsible tool-use card (call + result), styled like Claude's tool pills. */
function ToolCard({ call, result }: { call: TranscriptTurn; result?: TranscriptTurn }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-(--color-fg-muted) hover:bg-(--color-bg-soft)"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="font-medium">{call.tool ?? 'tool'}</span>
        <span className="ml-auto text-[11px] text-(--color-fg-subtle)">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-(--color-border) px-3 py-2.5">
          {call.text ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-(--color-fg-muted)">{call.text}</pre>
          ) : null}
          {result?.text ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-(--color-border) pt-2 font-mono text-[11px] leading-relaxed text-(--color-fg-muted)">
              {result.text}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Claude-style composer: auto-growing rounded input with a coral circular send button. */
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  running,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  running?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const canSend = !disabled && !running && value.trim().length > 0;

  return (
    <div className="rounded-3xl border border-(--color-border) bg-(--color-bg-soft) px-2 py-2 shadow-[0_2px_18px_rgba(0,0,0,0.35)] transition-colors focus-within:border-(--color-border-strong)">
      <textarea
        ref={ref}
        rows={1}
        className="block max-h-[200px] w-full resize-none bg-transparent px-3 py-1.5 text-[15px] leading-relaxed text-(--color-fg) outline-none placeholder:text-(--color-fg-subtle)"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="flex items-center justify-end px-1">
        <button
          aria-label="Send"
          onClick={onSend}
          disabled={!canSend}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            canSend ? 'bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-strong)' : 'bg-(--color-bg-soft) text-(--color-fg-subtle)'
          }`}
        >
          {running ? (
            <span className="dot-pulse" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ---- Runtimes tab ----

function RuntimeTab() {
  const store = useStore();
  const [detected, setDetected] = useState<DetectedAgent[] | null>(null);
  const [execEdits, setExecEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isTauri()) {
      setDetected([]);
      return;
    }
    detectAgents()
      .then(setDetected)
      .catch(() => setDetected([]));
  }, []);

  async function add(d: DetectedAgent, executor: string) {
    const host = await hostname();
    addRuntime({ name: `${kindLabel(d.kind)} · ${host}`, kind: d.kind as RuntimeKind, executor });
  }

  return (
    <Page title="Runtimes" count={store.runtimes.length}>
      {store.runtimes.length === 0 ? (
        <p className="muted text-sm">No runtimes yet. Add a detected CLI below.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {store.runtimes.map((r) => (
            <RuntimeCard key={r.id} runtime={r} onRemove={() => removeRuntime(r.id)} />
          ))}
        </ul>
      )}

      <section className="mt-2">
        <h2 className="section">Detected on this machine</h2>
        {!isTauri() ? (
          <p className="muted text-sm">Runtime detection runs in the desktop app.</p>
        ) : detected === null ? (
          <p className="muted text-sm">Scanning…</p>
        ) : detected.length === 0 ? (
          <p className="muted text-sm">No known agent CLIs found on your PATH.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {detected.map((d) => {
              const exec = execEdits[d.command] ?? d.default_executor;
              return (
                <li key={d.command} className="rounded-md border border-(--color-border) p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm">
                        {kindLabel(d.kind)} <span className="muted">· {d.command}</span>
                      </div>
                      <div className="muted truncate text-[11px]">{d.version || d.path}</div>
                    </div>
                    <button className="btn" onClick={() => add(d, exec)}>
                      Add
                    </button>
                  </div>
                  <input
                    className="inp mt-2 font-mono text-xs"
                    value={exec}
                    onChange={(e) => setExecEdits((p) => ({ ...p, [d.command]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}

function RuntimeCard({ runtime, onRemove }: { runtime: Runtime; onRemove: () => void }) {
  return (
    <li className="rounded-md border border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm">
            {runtime.name} <span className="muted text-[11px]">· {kindLabel(runtime.kind)}</span>
          </div>
          <div className="muted truncate font-mono text-[11px]">{runtime.executor}</div>
        </div>
        <button className="btn-ghost shrink-0 text-red-400" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

// ---- Personas tab ----

function PersonasTab() {
  const store = useStore();
  const [adding, setAdding] = useState(false);

  return (
    <Page
      title="Personas"
      count={store.personas.length}
      description="An actor (name, model, system prompt) that runs on a runtime. Assign it to a runtime, then run it."
      action={
        <button className="btn-ghost text-xs" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New persona'}
        </button>
      }
    >
      {adding ? (
        <NewPersonaForm
          onCreate={(input) => {
            addPersona(input);
            setAdding(false);
          }}
        />
      ) : null}

      {store.personas.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {store.personas.map((p) => (
            <PersonaCard key={p.id} persona={p} runtimes={store.runtimes} />
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">No personas yet. Create one to give your runtimes an actor to run.</p>
      )}
    </Page>
  );
}

function NewPersonaForm({
  onCreate,
}: {
  onCreate: (input: { name: string; model?: string; systemPrompt?: string; permissions?: PermissionPolicy }) => void;
}) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [permissions, setPermissions] = useState<PermissionPolicy>(DEFAULT_PERMISSIONS);

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-(--color-border) p-2">
      <input className="inp text-xs" placeholder="Persona name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className="inp text-xs" placeholder="Model (optional, e.g. claude-opus-4-8)" value={model} onChange={(e) => setModel(e.target.value)} />
      <textarea
        className="inp font-mono text-xs"
        rows={3}
        placeholder="System prompt (optional) — injected into the runtime at execution time"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />
      <div className="flex flex-col gap-1">
        <span className="section mb-0">Tool permissions</span>
        <PermissionEditor value={permissions} onChange={setPermissions} />
      </div>
      <button
        className="btn self-start text-xs"
        onClick={() => onCreate({ name: name.trim(), model: model.trim() || undefined, systemPrompt: systemPrompt.trim() || undefined, permissions })}
        disabled={!name.trim()}
      >
        Create persona
      </button>
    </div>
  );
}

/**
 * Edits a persona's tool-permission policy. Runtime-aware: a tool-name allowlist is only
 * offered when the assigned runtime kind supports one (otherwise "Restrict" falls back to
 * the CLI's default approvals, which we make explicit). `kind` is undefined before a runtime
 * is assigned (e.g. at creation).
 */
function PermissionEditor({
  kind,
  value,
  onChange,
}: {
  kind?: RuntimeKind;
  value: PermissionPolicy;
  onChange: (p: PermissionPolicy) => void;
}) {
  const supportsAllowlist = kind != null && SUPPORTS_ALLOWLIST.includes(kind);
  const commons = value.allow.filter((t) => COMMON_TOOLS.includes(t));
  const parseExtra = (text: string) =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !COMMON_TOOLS.includes(s));
  const [extraText, setExtraText] = useState(() => value.allow.filter((t) => !COMMON_TOOLS.includes(t)).join(', '));

  const toggle = (tool: string) => {
    const nextCommons = commons.includes(tool) ? commons.filter((t) => t !== tool) : [...commons, tool];
    onChange({ ...value, allow: [...nextCommons, ...parseExtra(extraText)] });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <button className={value.mode === 'all' ? 'tab tab-active' : 'tab'} onClick={() => onChange({ ...value, mode: 'all' })}>
          Allow all tools
        </button>
        <button className={value.mode === 'allowlist' ? 'tab tab-active' : 'tab'} onClick={() => onChange({ ...value, mode: 'allowlist' })}>
          Restrict
        </button>
      </div>

      {value.mode === 'allowlist' ? (
        supportsAllowlist ? (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {COMMON_TOOLS.map((t) => (
                <label key={t} className="flex items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={value.allow.includes(t)} onChange={() => toggle(t)} />
                  {t}
                </label>
              ))}
            </div>
            <input
              className="inp font-mono text-xs"
              placeholder="Extra patterns, comma-separated (e.g. Bash(git *))"
              value={extraText}
              onChange={(e) => {
                setExtraText(e.target.value);
                onChange({ ...value, allow: [...commons, ...parseExtra(e.target.value)] });
              }}
            />
          </>
        ) : (
          <p className="muted text-[11px]">
            {kind ? kindLabel(kind) : 'This runtime'} runs with its default approvals; in unattended runs most tools stay
            blocked. Use “Allow all” to let it act.
          </p>
        )
      ) : null}
    </div>
  );
}

function PersonaCard({ persona, runtimes }: { persona: Persona; runtimes: Runtime[] }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState<string | null>(null);
  const live = useLiveRun(activeDispatch);
  const events = open ? eventsForPersona(persona.id).slice(-30).reverse() : [];

  const policy = persona.permissions ?? DEFAULT_PERMISSIONS;
  const runtimeKind = runtimes.find((r) => r.id === persona.runtimeId)?.kind;
  const permSummary =
    policy.mode === 'all' ? 'Allow all tools' : policy.allow.length ? `Restrict · ${policy.allow.join(', ')}` : 'Restrict · nothing';

  async function run() {
    if (!prompt.trim()) return;
    setRunning(true);
    setOutcome(null);
    try {
      const r = await runPersona(persona.id, prompt.trim(), setActiveDispatch);
      setOutcome(r.ok ? `Done in ${r.durationMs}ms` : `Failed${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`);
    } catch (e) {
      setOutcome((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <li className="rounded-md border border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => setOpen((v) => !v)}>
          <div className="truncate text-sm">
            {persona.name}
            {persona.model ? <span className="muted text-[11px]"> · {persona.model}</span> : null}
          </div>
          {persona.systemPrompt ? <div className="muted truncate text-[11px]">{persona.systemPrompt}</div> : null}
        </button>
        <button className="btn-ghost shrink-0 text-[11px] text-red-400" onClick={() => deletePersona(persona.id)}>
          Delete
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="muted shrink-0">Runtime</span>
        <select
          className="inp flex-1 text-xs"
          value={persona.runtimeId ?? ''}
          onChange={(e) => updatePersona(persona.id, { runtimeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {runtimes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="muted truncate">Permissions · {permSummary}</span>
          <button className="btn-ghost shrink-0 text-[11px]" onClick={() => setEditPerms((v) => !v)}>
            {editPerms ? 'Done' : 'Edit'}
          </button>
        </div>
        {editPerms ? (
          <PermissionEditor
            kind={runtimeKind}
            value={policy}
            onChange={(permissions) => updatePersona(persona.id, { permissions })}
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <textarea
          className="inp text-xs"
          rows={2}
          placeholder={persona.runtimeId ? 'Prompt — what should this persona do?' : 'Assign a runtime to run this persona'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!persona.runtimeId}
        />
        <div className="flex items-center gap-2">
          <button className="btn text-xs" onClick={run} disabled={running || !persona.runtimeId || !prompt.trim()}>
            {running ? 'Running…' : 'Run now'}
          </button>
          {outcome ? <span className="muted text-[11px]">{outcome}</span> : null}
        </div>
        {live ? <LiveConversation run={live} /> : null}
      </div>

      {open ? (
        events.length === 0 ? (
          <div className="muted mt-2 text-[11px]">No recorded activity.</div>
        ) : (
          <ul className="mt-2 flex flex-col gap-0.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono">{e.type}</span>
                <span className="muted shrink-0">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

// ---- Heartbeats tab ----

const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: 'Every minute', seconds: 60 },
  { label: 'Every 5 minutes', seconds: 300 },
  { label: 'Every 15 minutes', seconds: 900 },
  { label: 'Hourly', seconds: 3600 },
  { label: 'Every 6 hours', seconds: 21600 },
  { label: 'Daily', seconds: 86400 },
];

function humanInterval(seconds: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label.toLowerCase();
  if (seconds % 86400 === 0) return `every ${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `every ${seconds / 3600}h`;
  if (seconds % 60 === 0) return `every ${seconds / 60}m`;
  return `every ${seconds}s`;
}

function HeartbeatsTab() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const personaName = (id: string) => store.personas.find((p) => p.id === id)?.name ?? 'Unknown persona';

  return (
    <Page
      title="Heartbeats"
      count={store.heartbeats.length}
      description="A recurring prompt run against a persona on a schedule. Schedules advance only while this app is open."
      action={
        <button className="btn-ghost text-xs" disabled={store.personas.length === 0} onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ New heartbeat'}
        </button>
      }
    >
      {store.personas.length === 0 ? <p className="muted text-sm">Create a persona first — heartbeats target a persona.</p> : null}

      {adding ? (
        <NewHeartbeatForm
          personas={store.personas}
          onCreate={(input) => {
            addHeartbeat(input);
            setAdding(false);
          }}
        />
      ) : null}

      {store.heartbeats.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {store.heartbeats.map((h) => (
            <HeartbeatCard
              key={h.id}
              heartbeat={h}
              personaName={personaName(h.personaId)}
              onToggle={(enabled) => updateHeartbeat(h.id, { enabled })}
              onDelete={() => deleteHeartbeat(h.id)}
            />
          ))}
        </ul>
      ) : store.personas.length > 0 ? (
        <p className="muted text-sm">No heartbeats yet. Add one to run a persona on a schedule.</p>
      ) : null}
    </Page>
  );
}

function NewHeartbeatForm({
  personas,
  onCreate,
}: {
  personas: Persona[];
  onCreate: (input: { personaId: string; name?: string; prompt: string; intervalSeconds: number }) => void;
}) {
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? '');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(300);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-(--color-border) p-3">
      <label className="flex flex-col gap-1 text-[11px]">
        <span className="muted">Persona</span>
        <select className="inp text-xs" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <input className="inp text-xs" placeholder="Name (optional, e.g. Daily standup)" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea
        className="inp text-xs"
        rows={3}
        placeholder="Prompt — what the persona should do each time this fires"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <label className="flex flex-col gap-1 text-[11px]">
        <span className="muted">Interval</span>
        <select className="inp text-xs" value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>
          {INTERVAL_PRESETS.map((p) => (
            <option key={p.seconds} value={p.seconds}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn self-start text-xs"
        onClick={() => onCreate({ personaId, name: name.trim() || undefined, prompt: prompt.trim(), intervalSeconds })}
        disabled={!personaId || !prompt.trim()}
      >
        Create heartbeat
      </button>
    </div>
  );
}

function HeartbeatCard({
  heartbeat,
  personaName,
  onToggle,
  onDelete,
}: {
  heartbeat: Heartbeat;
  personaName: string;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const h = heartbeat;
  return (
    <li className="rounded-md border border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm">
            {h.name || 'Heartbeat'} <span className="muted text-[11px]">· {personaName}</span>
          </div>
          <div className="muted text-[11px]">
            {humanInterval(h.intervalSeconds)}
            {h.enabled ? <span> · next {timeUntil(h.nextFireAt)}</span> : <span> · paused</span>}
            {h.lastFiredAt ? <span> · last fired {timeAgo(h.lastFiredAt)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="btn-ghost text-[11px]" onClick={() => onToggle(!h.enabled)}>
            {h.enabled ? 'Pause' : 'Resume'}
          </button>
          <button className="btn-ghost text-[11px] text-red-400" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

// ---- Activity tab ----

/** A session = one run's worth of events (its transcript). Loose events with no
 *  dispatch each stand alone as a single-entry session. */
interface RunSession {
  key: string;
  dispatchId: string | null;
  personaId: string | null;
  runtimeId: string | null;
  /** The CLI session id reported by a run, if any — used to load the transcript. */
  sessionId: string | null;
  events: AgentEvent[];
  lastAt: string;
}

function groupSessions(events: AgentEvent[]): RunSession[] {
  const byDispatch = new Map<string, AgentEvent[]>();
  for (const e of events) {
    const key = e.dispatchId ?? `event:${e.id}`;
    const list = byDispatch.get(key);
    if (list) list.push(e);
    else byDispatch.set(key, [e]);
  }
  const sessions: RunSession[] = [];
  for (const [key, evs] of byDispatch) {
    evs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const first = evs[0];
    const sessionId = evs.map((e) => e.payload?.sessionId).find((v): v is string => typeof v === 'string' && v.length > 0) ?? null;
    sessions.push({
      key,
      dispatchId: first.dispatchId ?? null,
      personaId: evs.find((e) => e.personaId)?.personaId ?? null,
      runtimeId: evs.find((e) => e.runtimeId)?.runtimeId ?? null,
      sessionId,
      events: evs,
      lastAt: evs[evs.length - 1].createdAt,
    });
  }
  sessions.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return sessions;
}

function ActivityTab() {
  const store = useStore();
  const personaNames = Object.fromEntries(store.personas.map((p) => [p.id, p.name]));
  const runtimeNames = Object.fromEntries(store.runtimes.map((r) => [r.id, r.name]));
  const sessions = groupSessions(store.events);

  return (
    <Page
      title="Sessions"
      count={sessions.length}
      description="Every run, newest first. A session groups the events from one run into a transcript; expand to read it."
    >
      {sessions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionCard
              key={s.key}
              session={s}
              personaName={s.personaId ? personaNames[s.personaId] ?? 'Unknown persona' : null}
              runtimeName={s.runtimeId ? runtimeNames[s.runtimeId] ?? 'Unknown runtime' : null}
            />
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">No activity recorded yet.</p>
      )}
    </Page>
  );
}

/** A one-line + body summary of an event payload — surfaces exit code, timing,
 *  and the captured stderr/stdout so a failed run explains itself. */
function eventDetail(payload: Record<string, unknown>): string | null {
  const meta: string[] = [];
  if (typeof payload.exitCode === 'number') meta.push(`exit ${payload.exitCode}`);
  if (typeof payload.durationMs === 'number') meta.push(`${payload.durationMs}ms`);

  const body =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : typeof payload.output === 'string' && payload.output.trim()
        ? payload.output.trim()
        : typeof payload.prompt === 'string' && payload.prompt.trim()
          ? payload.prompt.trim()
          : '';

  const head = meta.join(' · ');
  if (!head && !body) return null;
  return [head, body].filter(Boolean).join('\n');
}

type TranscriptState = 'unloaded' | 'loading' | 'loaded' | 'missing' | 'error';

function SessionCard({ session, personaName, runtimeName }: { session: RunSession; personaName: string | null; runtimeName: string | null }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [tState, setTState] = useState<TranscriptState>('unloaded');
  const live = useLiveRun(session.dispatchId);
  const title = session.dispatchId ? `Run ${session.dispatchId.slice(0, 8)}` : session.events[0].type;
  const hasTranscript = Boolean(session.sessionId) && isTauri();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && hasTranscript && tState === 'unloaded' && session.sessionId) {
      setTState('loading');
      try {
        const raw = await readAgentTranscript(session.sessionId);
        if (!raw) {
          setTState('missing');
          return;
        }
        setTurns(parseClaudeTranscript(raw));
        setTState('loaded');
      } catch {
        setTState('error');
      }
    }
  }

  return (
    <li className="rounded-md border border-(--color-border) p-3">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={toggle}>
        <div className="min-w-0">
          <div className="truncate text-sm">
            {title}
            {personaName ? <span className="muted text-[11px]"> · {personaName}</span> : null}
            {hasTranscript ? <span className="text-[11px] text-(--color-success)"> · transcript</span> : null}
          </div>
          <div className="muted text-[11px]">
            {session.events.length} event{session.events.length === 1 ? '' : 's'}
            {runtimeName ? ` · ${runtimeName}` : ''} · {timeAgo(session.lastAt)}
          </div>
        </div>
        <span className="muted shrink-0 text-[11px]">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="mt-2 border-t border-(--color-border) pt-2">
          {live ? (
            <LiveConversation run={live} />
          ) : hasTranscript ? (
            tState === 'loading' ? (
              <div className="muted text-[11px]">Reading transcript…</div>
            ) : tState === 'missing' ? (
              <div className="muted text-[11px]">No local transcript found for this session.</div>
            ) : tState === 'error' ? (
              <div className="text-[11px] text-red-400">Could not read the transcript file.</div>
            ) : turns.length > 0 ? (
              <Conversation committed={turns} />
            ) : (
              <div className="muted text-[11px]">Transcript is empty.</div>
            )
          ) : null}

          <div className={hasTranscript ? 'mt-3 border-t border-(--color-border) pt-2' : ''}>
            {hasTranscript ? <div className="section">Events</div> : null}
            <ol className="flex flex-col gap-1.5">
              {session.events.map((e) => {
                const detail = eventDetail(e.payload ?? {});
                const failed = e.type === 'command_failed';
                return (
                  <li key={e.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className={`truncate font-mono ${failed ? 'text-red-400' : 'text-(--color-fg)'}`}>{e.type}</span>
                      <span className="muted shrink-0">{timeAgo(e.createdAt)}</span>
                    </div>
                    {detail ? (
                      <pre
                        className={`overflow-x-auto whitespace-pre-wrap break-words rounded bg-(--color-bg-soft) px-2 py-1 text-[10px] leading-relaxed ${failed ? 'text-red-300' : 'text-(--color-fg-muted)'}`}
                      >
                        {detail}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : null}
    </li>
  );
}

const TURN_META: Record<TurnRole, { label: string; cls: string }> = {
  user: { label: 'User', cls: 'text-(--color-fg)' },
  assistant: { label: 'Assistant', cls: 'text-(--color-fg)' },
  tool: { label: 'Tool', cls: 'text-(--color-warn)' },
  result: { label: 'Result', cls: 'text-(--color-fg-subtle)' },
};

function TurnRow({ turn, streaming }: { turn: TranscriptTurn; streaming?: boolean }) {
  const meta = TURN_META[turn.role];
  const mono = turn.role === 'tool' || turn.role === 'result';
  return (
    <li className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide">
        <span className={meta.cls}>{meta.label}</span>
        {turn.tool && turn.role === 'tool' ? <span className="muted"> · {turn.tool}</span> : null}
      </div>
      <div className={`whitespace-pre-wrap break-words text-[11px] leading-relaxed ${mono ? 'font-mono text-(--color-fg-muted)' : 'text-(--color-fg)'}`}>
        {turn.text}
        {streaming ? <span className="caret" /> : null}
      </div>
    </li>
  );
}

/**
 * Renders one conversation — live (token-by-token, with a typing caret) or historical.
 * Auto-scrolls to the newest content while a run is in flight. For raw runtimes the growing
 * stdout/stderr text is shown verbatim.
 */
function Conversation({
  committed,
  streamingText,
  raw,
  running,
}: {
  committed: TranscriptTurn[];
  streamingText?: string;
  raw?: string;
  running?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (running && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  });
  const empty = committed.length === 0 && !streamingText && !raw;

  return (
    <div ref={ref} className="max-h-96 overflow-auto rounded-md border border-(--color-border) bg-(--color-bg-soft) p-2">
      {committed.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {committed.map((t, i) => (
            <TurnRow key={i} turn={t} />
          ))}
        </ol>
      ) : null}
      {streamingText ? (
        <ol className="mt-2 flex flex-col gap-2">
          <TurnRow turn={{ role: 'assistant', text: streamingText }} streaming={running} />
        </ol>
      ) : null}
      {raw ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-(--color-fg-muted)">{raw}</pre> : null}
      {empty ? <div className="muted text-[11px]">{running ? 'Starting…' : 'No output.'}</div> : null}
    </div>
  );
}

/** Bridges a `LiveRun` (or its absence) into <Conversation>. */
function LiveConversation({ run }: { run: LiveRun }) {
  return <Conversation committed={run.committed} streamingText={run.streamingText} raw={run.raw} running={run.status === 'running'} />;
}

// ---- small presentational helpers ----
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function timeUntil(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.round((t - Date.now()) / 1000);
  if (s <= 0) return 'now';
  if (s < 60) return `in ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}

export function Style() {
  return (
    <style>{`
      .inp { background:var(--color-bg-soft); border:1px solid var(--color-border); border-radius:var(--radius-button); padding:8px 10px; color:var(--color-fg); outline:none; }
      .inp:focus { border-color:var(--color-border-strong); }
      .inp::placeholder { color:var(--color-fg-subtle); }
      .btn { background:var(--color-accent); color:var(--color-bg); border-radius:var(--radius-button); padding:8px 14px; font-size:13px; font-weight:500; }
      .btn:hover { background:var(--color-accent-strong); } .btn:disabled { opacity:.5; }
      .btn-ghost { color:var(--color-fg-muted); border-radius:var(--radius-button); padding:6px 12px; font-size:13px; } .btn-ghost:hover { color:var(--color-fg); }
      .muted { color:var(--color-fg-muted); }
      .section { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--color-fg-subtle); margin-bottom:8px; }
      .tab { padding:8px 12px; font-size:13px; color:var(--color-fg-muted); border-bottom:2px solid transparent; margin-bottom:-1px; }
      .tab:hover { color:var(--color-fg); }
      .tab-active { color:var(--color-fg); border-bottom-color:var(--color-accent); }
      .caret { display:inline-block; width:6px; height:12px; margin-left:2px; vertical-align:text-bottom; background:var(--color-accent); animation:blink 1s step-start infinite; }
      @keyframes blink { 50% { opacity:0; } }
    `}</style>
  );
}
