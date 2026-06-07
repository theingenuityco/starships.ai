import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSmoothedText } from './useSmoothedText';
import {
  addAllowedTools,
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
import { ProviderKeys } from './ProvidersTab';
import { COMMON_TOOLS, DEFAULT_PERMISSIONS, SUPPORTS_ALLOWLIST, SUPPORTS_APPROVAL, type PermissionPolicy } from './permissions';
import { useLiveRun, type LiveRun } from './liveRuns';
import { allowAlways, decideApproval, initApprovals, useApprovals } from './approvals';

const KIND_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  cursor: 'Cursor',
  custom: 'Custom',
  starship: 'Starship (built-in)',
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
    initApprovals(); // subscribe to mid-run tool-approval requests (claude-code)
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

  return (
    <>
      {store.onboardedAt ? <Dashboard /> : <Onboarding />}
      <ApprovalLayer />
    </>
  );
}

/**
 * Global overlay that surfaces mid-run tool-approval requests (claude-code). The agent
 * is paused on the other end of the loopback hook until the user answers, so we show one
 * request at a time as a modal. "Allow always" teaches the persona (adds the tool to its
 * allowlist) so the same tool won't ask again.
 */
function ApprovalLayer() {
  const queue = useApprovals();
  const req = queue[0];
  if (!req) return null;
  const more = queue.length - 1;
  const input = (() => {
    try {
      const s = JSON.stringify(req.toolInput, null, 2);
      return s && s !== 'null' ? (s.length > 1200 ? `${s.slice(0, 1200)}…` : s) : '';
    } catch {
      return '';
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Permission request</div>
          <span className="muted text-[10px] uppercase tracking-wide">{kindLabel(req.runtime)}</span>
        </div>
        <div className="muted mt-0.5 text-[11px]">
          {req.personaName ? `${req.personaName} ` : 'An agent '}wants to use a tool not on its allowlist.
        </div>
        <div className="mt-3 rounded-md border border-(--color-border) bg-(--color-bg) p-2">
          <div className="text-[13px]">
            Tool: <span className="font-mono">{req.toolName}</span>
          </div>
          {input ? (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-(--color-fg-muted)">
              {input}
            </pre>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn text-xs" onClick={() => decideApproval(req.key, 'allow')}>
            Allow once
          </button>
          {req.personaId ? (
            <button className="btn-ghost text-xs" onClick={() => allowAlways(req.key)}>
              Allow always
            </button>
          ) : null}
          <button className="btn-ghost text-xs text-red-400" onClick={() => decideApproval(req.key, 'deny')}>
            Deny
          </button>
          {more > 0 ? <span className="muted ml-auto text-[11px]">{more} more queued</span> : null}
        </div>
      </div>
    </div>
  );
}

type Tab = 'new' | 'runtime' | 'personas' | 'heartbeats' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'new', label: 'New chat' },
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
  const [tab, setTab] = useState<Tab>('new');
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSelection, setChatSelection] = useState<string | null>(null);
  // A first message typed on the New page, handed to the freshly-created thread to auto-send.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const fullscreen = useFullscreen();
  const conversations = useConversations();

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
    // Drop any not-yet-sent New-page draft so it can't auto-send into this thread.
    setPendingMessage(null);
    setTab('new');
    setSearchOpen(false);
  };

  // New chat: drop any selection and land on the New page (the bare composer).
  const newChat = () => {
    setChatSelection(null);
    setPendingMessage(null);
    setTab('new');
  };

  // Send the first message from the New page: create the thread, then hand the
  // text to it as a pending message so it auto-sends once it mounts.
  const startConversation = (personaId: string, text: string) => {
    const conv = addConversation({ personaId, title: text.slice(0, 48) || 'New conversation' });
    setPendingMessage(text);
    setChatSelection(conv.id);
    setTab('new');
  };

  // Navigate to a page: drop any open conversation so the page (not a thread) shows.
  const goTab = (t: Tab) => {
    setChatSelection(null);
    // Also drop a pending New-page draft, so navigating away can't auto-send it later.
    setPendingMessage(null);
    setTab(t);
  };

  // Deleting the open conversation must clear the selection, or the chat pane
  // would sit forever on "Loading conversation…" for a thread that's gone.
  const removeConversation = (id: string) => {
    deleteConversation(id);
    if (chatSelection === id) setChatSelection(null);
  };

  // When a conversation is open, its breadcrumb rides inside the top strip's row
  // so it lines up with the traffic lights and the sidebar's collapse/search
  // controls, instead of sitting in a band below them.
  const openConvo = chatSelection ? conversations.find((c) => c.id === chatSelection) : null;
  const breadcrumb = openConvo ? (
    <ConversationHeader
      title={openConvo.title}
      onHome={newChat}
      onRename={(t) => updateConversationTitle(openConvo.id, t)}
      onDelete={() => removeConversation(openConvo.id)}
      onToggleSidebar={() => setCollapsed((c) => !c)}
    />
  ) : null;

  // App shell: a floating nav sidebar beside a flush content area. There's no
  // separate title band — the macOS traffic lights overlay the sidebar's own top
  // inset (Claude-style), so the nav sits right under them with no empty gap. The
  // sidebar collapses; its top toolbar and the content strip stay draggable.
  return (
    <div className="flex h-full">
      {collapsed ? null : (
        <Sidebar
          tab={tab}
          setTab={goTab}
          selectedChatId={chatSelection}
          onOpenConversation={openConversation}
          onNewChat={newChat}
          onDeleteConversation={removeConversation}
          fullscreen={fullscreen}
          onCollapse={() => setCollapsed(true)}
          onSearch={() => setSearchOpen(true)}
        />
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopStrip
          collapsed={collapsed}
          fullscreen={fullscreen}
          onExpand={() => setCollapsed(false)}
          onSearch={() => setSearchOpen(true)}
          breadcrumb={breadcrumb}
        />
        {chatSelection ? (
          <ChatTab
            selectedId={chatSelection}
            onSelect={setChatSelection}
            onStart={startConversation}
            pendingMessage={pendingMessage}
            onConsumePending={() => setPendingMessage(null)}
          />
        ) : tab === 'new' ? (
          <ChatTab
            selectedId={null}
            onSelect={setChatSelection}
            onStart={startConversation}
            pendingMessage={null}
            onConsumePending={() => setPendingMessage(null)}
          />
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
            goTab(t);
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
    new: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
      </>
    ),
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
      className="h-3.5 w-3.5 shrink-0 opacity-80"
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
  selectedChatId,
  onOpenConversation,
  onNewChat,
  onDeleteConversation,
  fullscreen,
  onCollapse,
  onSearch,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedChatId: string | null;
  onOpenConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  fullscreen: boolean;
  onCollapse: () => void;
  onSearch: () => void;
}) {
  const store = useStore();
  const conversations = useConversations();
  const recents = [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const personaName = (id: string) => store.personas.find((p) => p.id === id)?.name ?? 'Unknown persona';

  return (
    <aside className="m-1.5 flex w-52 shrink-0 flex-col overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev) px-2 pb-2 pt-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)] sm:w-60 lg:mr-0 lg:w-72">
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
      <nav className="mt-3 flex shrink-0 flex-col gap-0.5">
        {TABS.map((t) => {
          // "New chat" is active only when no conversation is open; otherwise the
          // open thread owns the highlight (in the Recents list below).
          const active = t.id === 'new' ? tab === 'new' && !selectedChatId : tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => (t.id === 'new' ? onNewChat() : setTab(t.id))}
              className={`flex w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-[13px] tracking-tight transition-colors ${
                active ? 'bg-(--color-accent-soft) text-(--color-fg)' : 'text-(--color-fg-muted) hover:bg-(--color-accent-soft) hover:text-(--color-fg)'
              }`}
            >
              <TabIcon id={t.id} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Recents: the conversation history lives here (Claude-desktop style), not on
          the chat page. The list owns the only scroll region so the nav stays put. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between pb-1 pl-2.5 pr-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-(--color-fg-muted)">Recents</span>
          <button
            type="button"
            title="New chat"
            aria-label="New chat"
            onClick={onNewChat}
            className="flex h-5 w-5 items-center justify-center rounded text-(--color-fg-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-(--color-fg)"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
          {recents.length === 0 ? (
            <p className="px-2.5 py-1 text-[11px] text-(--color-fg-muted)">No chats yet.</p>
          ) : (
            recents.map((c) => {
              const isActive = selectedChatId === c.id;
              return (
                <div key={c.id} className="group/chat relative">
                  <button
                    onClick={() => onOpenConversation(c.id)}
                    title={`${c.title} · ${personaName(c.personaId)}`}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-[13px] tracking-tight transition-colors ${
                      isActive ? 'bg-(--color-accent-soft) text-(--color-fg)' : 'text-(--color-fg-muted) hover:bg-(--color-accent-soft) hover:text-(--color-fg)'
                    }`}
                  >
                    <svg className="h-2 w-2 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                    <span className="truncate pr-5">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    title="Delete chat"
                    aria-label="Delete chat"
                    onClick={() => onDeleteConversation(c.id)}
                    className="absolute right-1 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-(--color-fg-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-red-400 group-hover/chat:flex"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
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
  breadcrumb,
}: {
  collapsed: boolean;
  fullscreen: boolean;
  onExpand: () => void;
  onSearch: () => void;
  breadcrumb?: ReactNode;
}) {
  // When a conversation is open its breadcrumb fills the row; otherwise the row is
  // a bare drag region. The breadcrumb carries its own interior drag spacer, so the
  // window stays movable from the empty stretch between the title and the controls.
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
            {breadcrumb ? <div className="ml-1 flex min-w-0 flex-1">{breadcrumb}</div> : <div data-tauri-drag-region className="h-full flex-1" />}
          </>
        ) : breadcrumb ? (
          // Left-pad to the content's own inset so the breadcrumb lines up with the messages below.
          <div className="flex min-w-0 flex-1 pl-5 sm:pl-6">{breadcrumb}</div>
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

function ChatTab({
  selectedId,
  onSelect,
  onStart,
  pendingMessage,
  onConsumePending,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onStart: (personaId: string, text: string) => void;
  pendingMessage: string | null;
  onConsumePending: () => void;
}) {
  const store = useStore();
  const selected = useConversation(selectedId);

  if (selectedId) {
    if (!selected) return <Page title="Chat"><p className="muted text-sm">Loading conversation…</p></Page>;
    return (
      <ConversationThread
        key={selected.id}
        conversation={selected}
        persona={store.personas.find((p) => p.id === selected.personaId)}
        pendingMessage={pendingMessage}
        onConsumePending={onConsumePending}
      />
    );
  }

  return <NewChatPage personas={store.personas} onStart={onStart} />;
}

/**
 * The New page: a bare composer (Claude-style) that starts a conversation on the
 * first send. A persona must back every conversation, so a compact persona picker
 * sits under the input rather than a separate "create" step.
 */
function NewChatPage({ personas, onStart }: { personas: Persona[]; onStart: (personaId: string, text: string) => void }) {
  const runnable = personas.filter((p) => p.runtimeId);
  const [personaId, setPersonaId] = useState(runnable[0]?.id ?? personas[0]?.id ?? '');
  const [input, setInput] = useState('');
  const persona = personas.find((p) => p.id === personaId);
  const noRuntime = !persona?.runtimeId;

  function send() {
    const text = input.trim();
    if (!text || noRuntime) return;
    setInput('');
    onStart(personaId, text);
  }

  if (personas.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-4 sm:px-6">
        <p className="muted m-auto text-center text-sm">Create a persona first — a conversation runs on a persona.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-8 pt-4 sm:px-6">
      {/* Filler so the composer docks to the bottom; the prompt sits in the gap. */}
      <div className="flex flex-1 items-center justify-center">
        <h2 className="text-lg tracking-tight text-(--color-fg)">What can I help with?</h2>
      </div>

      {/* Composer pinned to the bottom — single line that grows with its content.
          The persona picker floats over its top-left corner. */}
      <div className="relative mx-auto w-full max-w-4xl">
        <PersonaSelect personas={personas} personaId={personaId} onChange={setPersonaId} className="absolute -top-2.5 left-0 z-10" />
        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          disabled={noRuntime}
          placeholder={noRuntime ? 'Assign a runtime to chat' : `Message ${persona?.name ?? 'agent'}…`}
        />
        {noRuntime ? (
          <p className="muted mt-2 text-center text-[11px]">Assign this persona to a runtime (Personas tab) to chat.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Custom persona picker (replaces the native <select>): a compact pill whose menu
 * opens upward, so it can float over the top-left of the composer it belongs to.
 */
function PersonaSelect({
  personas,
  personaId,
  onChange,
  className,
}: {
  personas: Persona[];
  personaId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = personas.find((p) => p.id === personaId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-2.5 py-1 text-[12px] text-(--color-fg-muted) transition-colors hover:border-(--color-border-strong) hover:text-(--color-fg)"
      >
        <svg className="h-3 w-3 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="max-w-[160px] truncate">{current?.name ?? 'Select persona'}</span>
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-20 mb-1.5 max-h-64 w-52 overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-0.5 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          {personas.map((p) => {
            const active = p.id === personaId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!p.runtimeId}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors ${
                  active ? 'bg-(--color-accent-soft) text-(--color-fg)' : 'text-(--color-fg-muted) hover:bg-(--color-accent-soft) hover:text-(--color-fg)'
                } ${p.runtimeId ? '' : 'cursor-not-allowed opacity-50'}`}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.runtimeId ? null : <span className="shrink-0 text-[10px] text-(--color-fg-subtle)">no runtime</span>}
                {active ? (
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Monitor/laptop glyph that leads the conversation breadcrumb (matches the app brand mark). */
function MonitorIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

/** Right-side panel toggle glyph (rounded frame with a divider toward the trailing edge). */
function PanelIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

/**
 * Breadcrumb header for an open conversation: `▢ starships.ai / <title> ⌄` on the
 * left with a panel toggle on the right. The brand mark routes home (new chat); the
 * title carries a dropdown (rename / delete) and supports inline rename in place.
 */
function ConversationHeader({
  title,
  onHome,
  onRename,
  onDelete,
  onToggleSidebar,
}: {
  title: string;
  onHome: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onToggleSidebar?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const startRename = () => {
    setDraft(title);
    setEditing(true);
    setMenuOpen(false);
  };
  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  };

  return (
    <div className="flex h-7 min-w-0 flex-1 items-center text-[13px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onHome}
          title="New chat"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-(--color-fg) transition-colors hover:bg-(--color-accent-soft)"
        >
          <MonitorIcon />
          <span className="tracking-tight">starships.ai</span>
        </button>
        <span className="shrink-0 text-(--color-fg-subtle)">/</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="min-w-0 flex-1 rounded border border-(--color-border) bg-(--color-bg-elev) px-1.5 py-0.5 text-[13px] text-(--color-fg) outline-none"
          />
        ) : (
          <div ref={ref} className="relative min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-(--color-fg-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-(--color-fg)"
            >
              <span className="truncate">{title}</span>
              <svg className="h-3 w-3 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {menuOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-0.5 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                <button
                  type="button"
                  onClick={startRename}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-(--color-fg-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-(--color-fg)"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-(--color-fg-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-red-400"
                >
                  Delete chat
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {/* Draggable filler so the window still moves from the empty stretch of the row. */}
      <div data-tauri-drag-region className="h-full flex-1" />
      {onToggleSidebar ? (
        <IconButton title="Toggle sidebar" onClick={onToggleSidebar}>
          <PanelIcon />
        </IconButton>
      ) : null}
    </div>
  );
}

function ConversationThread({
  conversation,
  persona,
  pendingMessage,
  onConsumePending,
}: {
  conversation: ConversationRecord;
  persona?: Persona;
  pendingMessage?: string | null;
  onConsumePending?: () => void;
}) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string[]>([]);
  const lastTextRef = useRef('');
  const live = useLiveRun(activeDispatch);
  const scrollRef = useRef<HTMLDivElement>(null);

  const noRuntime = !persona?.runtimeId;

  // Track whether the user is pinned to the bottom; if they scroll up to read
  // back, we stop yanking them down on every new token.
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Keep the newest content in view as messages land and tokens stream — but only
  // when pinned, and coalesced into a single rAF write so streaming doesn't force
  // a synchronous layout on every token.
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [conversation.messages.length, live?.committed.length, live?.streamingText, live?.raw]);

  // A conversation started from the New page carries its first message; send it
  // once on mount (this component is keyed by id, so it mounts fresh per thread).
  // The mount-time values are captured in refs so the effect reads only stable
  // refs — no changing props in scope, so the empty dep list is unambiguous.
  const sentPending = useRef(false);
  const pendingRef = useRef(pendingMessage);
  const consumePendingRef = useRef(onConsumePending);
  useEffect(() => {
    if (sentPending.current || !pendingRef.current) return;
    sentPending.current = true;
    consumePendingRef.current?.();
    void send(pendingRef.current);
  }, []);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || running || noRuntime) return;
    if (textArg == null) setInput('');
    setError(null);
    setDenied([]);
    lastTextRef.current = text;
    setRunning(true);
    // Show the user's message right away; the engine appends the agent's turns when it returns.
    appendConversationMessages(conversation.id, [{ role: 'user', text, at: new Date().toISOString() }]);
    try {
      const r = await runConversationTurn(conversation.id, text, setActiveDispatch);
      if (!r.ok) setError(`Run failed${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`);
      setDenied(r.deniedTools ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setActiveDispatch(null);
    }
  }

  // Allow the denied tools on this conversation's persona, then resend the last prompt.
  function allowAndRerun() {
    if (persona) addAllowedTools(persona.id, denied);
    setDenied([]);
    void send(lastTextRef.current);
  }

  const liveTurns = live?.status === 'running' ? live.committed : [];
  const items = groupTurns([...conversation.messages, ...liveTurns]);
  const streaming = live?.status === 'running' ? live.streamingText : '';
  const rawOnly = live?.status === 'running' && live.raw && live.committed.length === 0 && !live.streamingText ? live.raw : '';
  const empty = conversation.messages.length === 0 && !running;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-2 pt-2 sm:px-6">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-1 py-5">
          {empty ? <div className="muted py-16 text-center text-sm">Send a message to start the conversation.</div> : null}
          {items.map((it, i) =>
            it.kind === 'tools' ? (
              <ToolGroup key={i} items={it.items} defaultOpen={live?.status === 'running' && i === items.length - 1} />
            ) : (
              <ChatMessage key={i} turn={it.turn} />
            )
          )}
          {streaming ? <StreamingMessage text={streaming} /> : null}
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

      <div className="mx-auto w-full max-w-4xl pt-2">
        {noRuntime ? <p className="muted mb-2 text-center text-[11px]">Assign this persona to a runtime (Personas tab) to chat.</p> : null}
        {error ? <p className="mb-2 text-center text-[11px] text-red-400">{error}</p> : null}
        {!running && denied.length ? (
          <div className="mb-2">
            <DenialBanner tools={denied} onAllowRerun={allowAndRerun} busy={running} />
          </div>
        ) : null}
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          disabled={noRuntime}
          running={running}
          placeholder={noRuntime ? 'Assign a runtime to chat' : `Reply to ${persona?.name ?? 'agent'}…`}
        />
      </div>
    </div>
  );
}

/**
 * Shown after a run that the permission policy blocked: names the denied tools and
 * offers a one-click "add them to this persona's allowlist and run the same prompt
 * again". The universal fallback for every runtime — for claude-code, mid-run approval
 * (the live dialog) means this is rarely hit, but it still catches anything denied
 * unattended.
 */
function DenialBanner({ tools, onAllowRerun, busy }: { tools: string[]; onAllowRerun: () => void; busy?: boolean }) {
  if (!tools.length) return null;
  const many = tools.length > 1;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px]">
      <div className="text-amber-300">
        Blocked {many ? 'tools' : 'tool'}: <span className="font-mono">{tools.join(', ')}</span>
      </div>
      <div className="muted mt-0.5">The agent asked to use {many ? 'tools' : 'a tool'} this persona's permissions don't allow.</div>
      <button className="btn-ghost mt-1 text-[11px] text-amber-300 disabled:opacity-50" onClick={onAllowRerun} disabled={busy}>
        Allow {many ? 'them' : 'it'} + rerun
      </button>
    </div>
  );
}

/** One rendered chat turn: user → right bubble, assistant → full-width Markdown prose. */
function ChatMessage({ turn }: { turn: TranscriptTurn }) {
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
    </div>
  );
}

/**
 * In-flight assistant text. Smoothed to a steady type-out and rendered as plain
 * text rather than Markdown: the Markdown parser re-parses the whole message on
 * every render, which is O(n²) across a streaming message and the main source of
 * mid-stream jank. The committed turn re-renders as full Markdown once the message
 * finalizes (the `assistant` event supersedes this buffer), so formatting still
 * lands — just not on every token.
 */
function StreamingMessage({ text }: { text: string }) {
  const shown = useSmoothedText(text);
  return (
    <div className="px-0.5">
      <p className="md-p whitespace-pre-wrap break-words text-[15px] leading-relaxed text-(--color-fg)">
        {shown}
        <span className="caret-md" />
      </p>
    </div>
  );
}

type ToolPair = { call: TranscriptTurn; result?: TranscriptTurn };
type ChatItem = { kind: 'msg'; turn: TranscriptTurn } | { kind: 'tools'; items: ToolPair[] };

/**
 * Match a cluster's tool calls to their results. Parallel tool use arrives as
 * `tool, tool, result, result` with the results ordered by `tool_use` id rather
 * than position, so pair by id first; fall back to positional order for runtimes
 * (e.g. Codex) that emit no ids. Results with no matching call render on their own.
 */
function buildPairs(calls: TranscriptTurn[], results: TranscriptTurn[]): ToolPair[] {
  const byId = new Map<string, TranscriptTurn>();
  for (const r of results) if (r.id) byId.set(r.id, r);
  const loose = results.filter((r) => !r.id);
  const used = new Set<TranscriptTurn>();
  let looseIdx = 0;

  const pairs: ToolPair[] = calls.map((call) => {
    let result: TranscriptTurn | undefined;
    if (call.id && byId.has(call.id)) {
      result = byId.get(call.id);
    } else if (looseIdx < loose.length) {
      result = loose[looseIdx++];
    }
    if (result) used.add(result);
    return { call, result };
  });

  for (const r of results) {
    if (!used.has(r)) pairs.push({ call: { role: 'tool', text: '', tool: r.tool ?? 'result' }, result: r });
  }
  return pairs;
}

/**
 * Fold a flat turn list into render items. Runs of consecutive tool calls/results
 * collapse into a single `tools` group (the way Claude's app clusters back-to-back
 * tool use between prose turns), with calls paired to results by id within each run.
 */
function groupTurns(turns: TranscriptTurn[]): ChatItem[] {
  const items: ChatItem[] = [];
  let calls: TranscriptTurn[] = [];
  let results: TranscriptTurn[] = [];
  const flush = () => {
    if (calls.length || results.length) items.push({ kind: 'tools', items: buildPairs(calls, results) });
    calls = [];
    results = [];
  };
  for (const t of turns) {
    if (t.role === 'tool') calls.push(t);
    else if (t.role === 'result') results.push(t);
    else {
      flush();
      items.push({ kind: 'msg', turn: t });
    }
  }
  flush();
  return items;
}

/** Pretty-print a compact JSON input string; fall back to the raw text if it isn't JSON. */
function prettyInput(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Best-effort human label for a tool call: a verb plus a concise target (file, command, pattern). */
function toolLabel(call: TranscriptTurn): { verb: string; detail: string } {
  const name = call.tool ?? 'tool';
  let input: Record<string, unknown> = {};
  try {
    if (call.text) input = JSON.parse(call.text) as Record<string, unknown>;
  } catch {
    // non-JSON input (e.g. Codex shell commands stored as raw text)
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const base = (v: unknown) => {
    const s = str(v);
    return s ? (s.split('/').pop() ?? s) : '';
  };
  const firstLine = (v: unknown) => str(v).split('\n')[0];
  switch (name) {
    case 'Read':
      return { verb: 'Read', detail: base(input.file_path) };
    case 'Write':
      return { verb: 'Wrote', detail: base(input.file_path) };
    case 'Edit':
    case 'NotebookEdit':
      return { verb: 'Edited', detail: base(input.file_path) };
    case 'Bash':
    case 'shell':
      return { verb: 'Ran', detail: firstLine(input.command) || firstLine(call.text) };
    case 'Grep':
      return { verb: 'Searched', detail: str(input.pattern) };
    case 'Glob':
      return { verb: 'Found files', detail: str(input.pattern) };
    case 'WebFetch':
      return { verb: 'Fetched', detail: str(input.url) };
    case 'WebSearch':
      return { verb: 'Searched web', detail: str(input.query) };
    case 'Task':
      return { verb: 'Delegated', detail: str(input.description) };
    case 'result':
      return { verb: 'Tool result', detail: '' };
    default:
      return { verb: name, detail: firstLine(input.command || input.file_path || input.path) };
  }
}

/** A rotating disclosure chevron, shared by tool rows and group headers. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Condense a run of tool calls into a header phrase: verbs in first-seen order,
 * with a "×n" suffix when one verb repeats (e.g. "Read ×3 · Edited · Ran").
 */
function groupSummary(items: ToolPair[]): string {
  const counts = new Map<string, number>();
  for (const p of items) {
    const v = toolLabel(p.call).verb;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([v, n]) => (n > 1 ? `${v} ×${n}` : v)).join(' · ');
}

/** One clickable tool row: a text line that expands an inline details card (call input + result). */
function ToolRow({ pair }: { pair: ToolPair }) {
  const [open, setOpen] = useState(false);
  const { call, result } = pair;
  const { verb, detail } = toolLabel(call);
  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[13px] text-(--color-fg-subtle) hover:bg-(--color-bg-soft) hover:text-(--color-fg-muted)"
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron open={open} />
        <span className="shrink-0 font-medium text-(--color-fg-muted)">{verb}</span>
        {detail ? <span className="truncate font-mono text-[12px]">{detail}</span> : null}
      </button>
      {open ? (
        <div className="mb-1 ml-[18px] mt-1.5 space-y-2 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2.5">
          {call.text ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-(--color-fg-muted)">
              {prettyInput(call.text)}
            </pre>
          ) : null}
          {result?.text ? (
            <pre
              className={`overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-(--color-fg-muted) ${call.text ? 'border-t border-(--color-border) pt-2' : ''}`}
            >
              {result.text}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A run of consecutive tool calls. A single call renders as a bare row; multiple
 * collapse under one summary header (Claude-app style) that expands to the rows,
 * connected by a left rail. Each row still expands to its own details.
 */
function ToolGroup({ items, defaultOpen = false }: { items: ToolPair[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 1) return <ToolRow pair={items[0]} />;
  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[13px] text-(--color-fg-subtle) hover:bg-(--color-bg-soft) hover:text-(--color-fg-muted)"
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron open={open} />
        <span className="truncate font-medium text-(--color-fg-muted)">{groupSummary(items)}</span>
        <span className="ml-auto shrink-0 text-[11px] text-(--color-fg-subtle)">{items.length} steps</span>
      </button>
      {open ? (
        <div className="ml-[5px] mt-0.5 flex flex-col gap-0.5 border-l border-(--color-border) pl-3">
          {items.map((pair, i) => (
            <ToolRow key={i} pair={pair} />
          ))}
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
    <div className="flex items-end gap-1 rounded-xl border border-(--color-border) bg-(--color-bg-elev) px-2 py-2 shadow-[0_2px_18px_rgba(0,0,0,0.35)] transition-colors focus-within:border-(--color-border-strong)">
      <textarea
        ref={ref}
        rows={1}
        className="block max-h-[200px] min-w-0 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[14px] leading-normal text-(--color-fg) outline-none placeholder:text-(--color-fg-subtle)"
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
      <button
        aria-label="Send"
        onClick={onSend}
        disabled={!canSend}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          canSend ? 'bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-strong)' : 'bg-(--color-bg-soft) text-(--color-fg-subtle)'
        }`}
      >
        {running ? (
          <span className="dot-pulse" />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        )}
      </button>
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

  const builtinRuntime = store.runtimes.find((r) => r.kind === 'starship');
  function addBuiltin() {
    addRuntime({ name: 'Starship', kind: 'starship', executor: 'starship' });
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="section mb-0">Built-in runtime</h2>
          {!builtinRuntime ? (
            <button className="btn" onClick={addBuiltin}>
              Add Starship
            </button>
          ) : null}
        </div>
        <p className="muted text-[11px]">
          Runs the agent loop in-process with your own API keys — no external CLI. One runtime serves both providers;
          a persona’s model picks which one runs.
        </p>
        {builtinRuntime ? (
          <ProviderKeys />
        ) : (
          <p className="muted text-sm">Add the Starship runtime to configure provider keys.</p>
        )}
      </section>

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
/** Helper text under the allowlist editor, tailored to how the runtime handles approval. */
function approvalNote(kind?: RuntimeKind): string {
  switch (kind) {
    case 'claude-code':
    case 'hermes':
    case 'codex':
      return 'Tools you don’t list will pause and ask for approval while the app is open (denied if it’s closed).';
    case 'custom':
      return 'For cursor-agent, unlisted shell commands ask for approval (only Deny is reliably enforced). Other custom CLIs (aider, gemini) ignore this — use “Allow all”.';
    default:
      return 'This runtime runs with its default approvals; unlisted tools may be blocked in unattended runs.';
  }
}

function PermissionEditor({
  kind,
  value,
  onChange,
}: {
  kind?: RuntimeKind;
  value: PermissionPolicy;
  onChange: (p: PermissionPolicy) => void;
}) {
  // Claude shows tool checkboxes (its tool names); approval-capable runtimes whose tool
  // names differ list tools as free text. Runtimes with no approval channel get neither.
  const showChecks = kind != null && SUPPORTS_ALLOWLIST.includes(kind);
  const canApprove = kind != null && SUPPORTS_APPROVAL.includes(kind);

  // With checkboxes, the text field holds only the non-checkbox "extra" patterns; without
  // them it holds the whole allowlist (and must not strip names that happen to be COMMON_TOOLS).
  const commons = showChecks ? value.allow.filter((t) => COMMON_TOOLS.includes(t)) : [];
  const parseText = (text: string) =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && (!showChecks || !COMMON_TOOLS.includes(s)));
  const initialText = showChecks ? value.allow.filter((t) => !COMMON_TOOLS.includes(t)) : value.allow;
  const [text, setText] = useState(() => initialText.join(', '));

  const toggle = (tool: string) => {
    const nextCommons = commons.includes(tool) ? commons.filter((t) => t !== tool) : [...commons, tool];
    onChange({ ...value, allow: [...nextCommons, ...parseText(text)] });
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
        <>
          {showChecks ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {COMMON_TOOLS.map((t) => (
                <label key={t} className="flex items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={value.allow.includes(t)} onChange={() => toggle(t)} />
                  {t}
                </label>
              ))}
            </div>
          ) : null}
          {canApprove ? (
            <input
              className="inp font-mono text-xs"
              placeholder={showChecks ? 'Extra patterns, comma-separated (e.g. Bash(git *))' : 'Allowed tools, comma-separated (e.g. Shell, Read)'}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onChange({ ...value, allow: [...commons, ...parseText(e.target.value)] });
              }}
            />
          ) : null}
          <p className="muted text-[11px]">{approvalNote(kind)}</p>
        </>
      ) : null}
    </div>
  );
}

function PersonaCard({ persona, runtimes }: { persona: Persona; runtimes: Runtime[] }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [denied, setDenied] = useState<string[]>([]);
  const [editPerms, setEditPerms] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState<string | null>(null);
  const live = useLiveRun(activeDispatch);
  const events = open ? eventsForPersona(persona.id).slice(-30).reverse() : [];

  const policy = persona.permissions ?? DEFAULT_PERMISSIONS;
  const runtimeKind = runtimes.find((r) => r.id === persona.runtimeId)?.kind;
  const permSummary =
    policy.mode === 'all' ? 'Allow all tools' : policy.allow.length ? `Restrict · ${policy.allow.join(', ')}` : 'Restrict · nothing';

  async function run(textArg?: string) {
    const text = (textArg ?? prompt).trim();
    if (!text) return;
    setRunning(true);
    setOutcome(null);
    setDenied([]);
    try {
      const r = await runPersona(persona.id, text, setActiveDispatch);
      setOutcome(r.ok ? `Done in ${r.durationMs}ms` : `Failed${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`);
      setDenied(r.deniedTools ?? []);
    } catch (e) {
      setOutcome((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  // Add the denied tools to this persona's allowlist, then run the same prompt again.
  function allowAndRerun() {
    const text = prompt.trim();
    addAllowedTools(persona.id, denied);
    setDenied([]);
    void run(text);
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
          <button className="btn text-xs" onClick={() => void run()} disabled={running || !persona.runtimeId || !prompt.trim()}>
            {running ? 'Running…' : 'Run now'}
          </button>
          {outcome ? <span className="muted text-[11px]">{outcome}</span> : null}
        </div>
        {live ? <LiveConversation run={live} /> : null}
        {!running ? <DenialBanner tools={denied} onAllowRerun={allowAndRerun} busy={running} /> : null}
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
