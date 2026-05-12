import {
  formatDateTime,
  formatDuration,
  useGolemancyI18n,
} from "@golemancy/i18n";
import type {
  LocalRuntimeConfig,
  MessageResource,
  ProjectResource,
  RunEvent,
  RunStatus,
  RuntimeStatusResponse,
  ThreadResource,
} from "@golemancy/protocol";
import { useLingui } from "@lingui/react/macro";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowUp,
  AtSign,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  FolderPlus,
  LoaderCircle,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  Mic,
  Paperclip,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  User,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logoImage from "./assets/logo.png";
import { SidecarClient, defaultAgentConfig, defaultOpenAIProvider, type RunEventSubscription } from "./sidecar-client";

type AppScreen = "home" | "settings";
type Theme = "light" | "dark";
type SettingsSectionId = "general" | "appearance" | "runtime" | "local-data" | "security" | "about";

const settingsSections: Array<{
  id: SettingsSectionId;
  icon: typeof Settings;
}> = [
  { id: "general", icon: Settings },
  { id: "appearance", icon: Sun },
  { id: "runtime", icon: Server },
  { id: "local-data", icon: Database },
  { id: "security", icon: ShieldCheck },
  { id: "about", icon: FileText },
];

export function App() {
  const { t } = useLingui();
  const [screen, setScreen] = useState<AppScreen>("home");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("general");
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem("golemancy.theme");
    return stored === "dark" ? "dark" : "light";
  });
  const [runtimeConfig, setRuntimeConfig] = useState<LocalRuntimeConfig | null>(null);
  const [status, setStatus] = useState<RuntimeStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const config = await invoke<LocalRuntimeConfig>("get_runtime_config");
      const body = await fetchRuntimeStatus(config, t`Unable to prepare Golemancy`);
      setRuntimeConfig(config);
      setStatus(body);
    } catch (cause) {
      setRuntimeConfig(null);
      setStatus(null);
      setError(cause instanceof Error ? cause.message : t`Unable to prepare Golemancy`);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.localStorage.setItem("golemancy.theme", theme);
  }, [theme]);

  return (
    <main className="desktop-app" data-theme={theme}>
      {screen === "settings" ? (
        <SettingsScreen
          activeSection={settingsSection}
          runtimeConfig={runtimeConfig}
          status={status}
          error={error}
          loading={loading}
          theme={theme}
          onBack={() => setScreen("home")}
          onRefresh={refresh}
          onSectionChange={setSettingsSection}
          onThemeChange={setTheme}
        />
      ) : (
        <Workbench
          runtimeConfig={runtimeConfig}
          runtimeStatus={status}
          theme={theme}
          onOpenSettings={() => {
            setSettingsSection("general");
            setScreen("settings");
          }}
          onThemeChange={setTheme}
        />
      )}
    </main>
  );
}

interface WorkbenchProps {
  runtimeConfig: LocalRuntimeConfig | null;
  runtimeStatus: RuntimeStatusResponse | null;
  theme: Theme;
  onOpenSettings: () => void;
  onThemeChange: (theme: Theme) => void;
}

interface ActiveRunState {
  runId: string;
  status: RunStatus;
  events: RunEvent[];
  assistantDraft: string;
  lastSequence: number;
  error?: string;
}

function Workbench({
  runtimeConfig,
  runtimeStatus,
  theme,
  onOpenSettings,
  onThemeChange,
}: WorkbenchProps) {
  const { t } = useLingui();
  const client = useMemo(() => (runtimeConfig ? new SidecarClient(runtimeConfig) : null), [runtimeConfig]);
  const [projects, setProjects] = useState<ProjectResource[]>([]);
  const [threads, setThreads] = useState<ThreadResource[]>([]);
  const [messages, setMessages] = useState<MessageResource[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
  const subscriptionRef = useRef<RunEventSubscription | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const runBusy = activeRun ? ["queued", "running", "cancelling"].includes(activeRun.status) : false;
  const modelAccessReady = isModelAccessReady(runtimeStatus);

  const syncMessages = useCallback(
    async (threadId: string) => {
      if (!client) {
        return;
      }
      const body = await retryLocalRequest(() => client.listMessages(threadId));
      setMessages(body.messages);
    },
    [client],
  );

  const loadProjects = useCallback(async () => {
    if (!client) {
      setProjects([]);
      setThreads([]);
      setMessages([]);
      setSelectedProjectId(null);
      setSelectedThreadId(null);
      return;
    }

    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const body = await retryLocalRequest(() => client.listProjects());
      setProjects(body.projects);
      setSelectedProjectId((current) => {
        if (current && body.projects.some((project) => project.id === current)) {
          return current;
        }
        return body.projects[0]?.id ?? null;
      });
      if (body.projects.length === 0) {
        setThreads([]);
        setMessages([]);
        setSelectedThreadId(null);
      }
    } catch (cause) {
      setWorkspaceError(readErrorMessage(cause, t`Unable to load chats`));
    } finally {
      setWorkspaceLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!client || !selectedProjectId) {
      setThreads([]);
      setMessages([]);
      setSelectedThreadId(null);
      return;
    }

    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    void retryLocalRequest(() => client.listThreads(selectedProjectId))
      .then((body) => {
        if (cancelled) {
          return;
        }
        setThreads(body.threads);
        setSelectedThreadId((current) => {
          if (current && body.threads.some((thread) => thread.id === current)) {
            return current;
          }
          return body.threads[0]?.id ?? null;
        });
        if (body.threads.length === 0) {
          setMessages([]);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setWorkspaceError(readErrorMessage(cause, t`Unable to load chats`));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, selectedProjectId, t]);

  useEffect(() => {
    if (!client || !selectedThreadId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    void retryLocalRequest(() => client.listMessages(selectedThreadId))
      .then((body) => {
        if (!cancelled) {
          setMessages(body.messages);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setWorkspaceError(readErrorMessage(cause, t`Unable to load chat`));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, selectedThreadId, t]);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.abort();
    };
  }, []);

  const startRunStream = useCallback(
    (runId: string, threadId: string) => {
      if (!client) {
        return;
      }

      subscriptionRef.current?.abort();
      setActiveRun({
        runId,
        status: "queued",
        events: [],
        assistantDraft: "",
        lastSequence: 0,
      });

      subscriptionRef.current = client.subscribeRunEvents(runId, {
        onEvent: (event) => {
          setActiveRun((current) => mergeRunEvent(current, runId, event));
          if (isTerminalRunEvent(event)) {
            void syncMessages(threadId).catch((cause) => {
              setWorkspaceError(readErrorMessage(cause, t`Unable to refresh chat`));
            });
          }
        },
        onError: (cause) => {
          setActiveRun((current) =>
            current && current.runId === runId
              ? {
                  ...current,
                  status: current.status === "completed" ? current.status : "failed",
                  error: readErrorMessage(cause, t`Run event stream failed`),
                }
              : current,
          );
        },
      });
    },
    [client, syncMessages, t],
  );

  const handleNewChat = useCallback(() => {
    subscriptionRef.current?.abort();
    setSelectedThreadId(null);
    setMessages([]);
    setActiveRun(null);
    setDraft("");
    setWorkspaceError(null);
  }, []);

  const handleProjectSelect = useCallback((projectId: string) => {
    subscriptionRef.current?.abort();
    setActiveRun(null);
    setMessages([]);
    setSelectedThreadId(null);
    setSelectedProjectId(projectId);
  }, []);

  const handleThreadSelect = useCallback((threadId: string) => {
    subscriptionRef.current?.abort();
    setActiveRun(null);
    setSelectedThreadId(threadId);
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!client) {
      return;
    }

    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const body = await client.createProject(`Golemancy ${projects.length + 1}`);
      setProjects((current) => [body.project, ...current]);
      setSelectedProjectId(body.project.id);
      setThreads([]);
      setMessages([]);
      setSelectedThreadId(null);
    } catch (cause) {
      setWorkspaceError(readErrorMessage(cause, t`Unable to create project`));
    } finally {
      setWorkspaceLoading(false);
    }
  }, [client, projects.length, t]);

  const handleSubmit = useCallback(async () => {
    const message = draft.trim();
    if (!message || !client || modelAccessReady === false || submitting || runBusy) {
      return;
    }

    setSubmitting(true);
    setWorkspaceError(null);
    try {
      let projectId = selectedProjectId;
      if (!projectId) {
        const body = await client.createProject("golemancy");
        setProjects((current) => [body.project, ...current]);
        setSelectedProjectId(body.project.id);
        projectId = body.project.id;
      }

      let threadId = selectedThreadId;
      if (!threadId) {
        const body = await client.createThread(projectId, createThreadTitle(message));
        setThreads((current) => [body.thread, ...current]);
        setSelectedThreadId(body.thread.id);
        threadId = body.thread.id;
      }

      const response = await client.startRun(threadId, {
        message,
        provider: defaultOpenAIProvider(),
        agent: defaultAgentConfig(),
        engineId: "openai-agents",
      });
      setDraft("");
      await syncMessages(threadId);
      startRunStream(response.runId, threadId);
    } catch (cause) {
      setWorkspaceError(readErrorMessage(cause, t`Unable to start run`));
    } finally {
      setSubmitting(false);
    }
  }, [
    client,
    draft,
    modelAccessReady,
    runBusy,
    selectedProjectId,
    selectedThreadId,
    startRunStream,
    submitting,
    syncMessages,
    t,
  ]);

  const handleCancelRun = useCallback(async () => {
    if (!client || !activeRun || !runBusy) {
      return;
    }

    setActiveRun((current) => (current ? { ...current, status: "cancelling" } : current));
    try {
      await client.cancelRun(activeRun.runId);
    } catch (cause) {
      setWorkspaceError(readErrorMessage(cause, t`Unable to cancel run`));
    }
  }, [activeRun, client, runBusy, t]);

  return (
    <div className="workbench">
      <Sidebar
        loading={workspaceLoading}
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedThreadId={selectedThreadId}
        threads={threads}
        theme={theme}
        onCreateProject={() => void handleCreateProject()}
        onNewChat={handleNewChat}
        onOpenSettings={onOpenSettings}
        onProjectSelect={handleProjectSelect}
        onThemeChange={onThemeChange}
        onThreadSelect={handleThreadSelect}
      />
      <ConversationMain
        activeRun={activeRun}
        draft={draft}
        loading={workspaceLoading}
        messages={messages}
        modelAccessReady={modelAccessReady}
        runtimeConfig={runtimeConfig}
        selectedProject={selectedProject}
        selectedThread={selectedThread}
        submitting={submitting}
        workspaceError={workspaceError}
        onCancelRun={() => void handleCancelRun()}
        onDraftChange={setDraft}
        onSubmit={() => void handleSubmit()}
      />
    </div>
  );
}

interface SidebarProps {
  loading: boolean;
  projects: ProjectResource[];
  selectedProjectId: string | null;
  selectedThreadId: string | null;
  threads: ThreadResource[];
  theme: Theme;
  onCreateProject: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onProjectSelect: (projectId: string) => void;
  onThemeChange: (theme: Theme) => void;
  onThreadSelect: (threadId: string) => void;
}

function Sidebar({
  loading,
  projects,
  selectedProjectId,
  selectedThreadId,
  threads,
  theme,
  onCreateProject,
  onNewChat,
  onOpenSettings,
  onProjectSelect,
  onThemeChange,
  onThreadSelect,
}: SidebarProps) {
  const { t } = useLingui();
  const [projectOpen, setProjectOpen] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <aside className="sidebar" aria-label={t`Golemancy navigation`}>
      <div className="sidebar__top">
        <div className="brand-row">
          <Logo size={22} />
          <span className="brand-name">Golemancy</span>
        </div>

        <nav className="side-group" aria-label={t`Primary`}>
          <SideRow active={!selectedThreadId} icon={<MessageSquarePlus size={16} />} label={t`New chat`} onClick={onNewChat} />
        </nav>

        <SectionLabel onCreateProject={onCreateProject}>{t`Projects`}</SectionLabel>
        <div className="side-group">
          {projects.length > 0 ? (
            projects.map((project) => (
              <div key={project.id}>
                <button
                  className="side-row side-row--project"
                  data-active={project.id === selectedProjectId || undefined}
                  type="button"
                  onClick={() => {
                    onProjectSelect(project.id);
                    setProjectOpen(true);
                  }}
                >
                  <span className="side-row__icon">
                    <ChevronRight
                      className="chev"
                      data-open={(projectOpen && project.id === selectedProjectId) || undefined}
                      size={13}
                      aria-hidden
                    />
                  </span>
                  <Folder size={15} aria-hidden />
                  <span className="side-row__label">{project.name}</span>
                </button>
                {projectOpen && project.id === selectedProjectId ? (
                  <div className="project-children">
                    {threads.length > 0 ? (
                      threads.map((thread) => (
                        <button
                          className="thread-row"
                          data-active={thread.id === selectedThreadId || undefined}
                          key={thread.id}
                          type="button"
                          onClick={() => onThreadSelect(thread.id)}
                        >
                          <span>{thread.title}</span>
                        </button>
                      ))
                    ) : (
                      <div className="project-empty">{loading ? t`Loading` : t`No saved chats yet`}</div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div>
              <button className="side-row side-row--project" data-active type="button">
                <span className="side-row__icon">
                  <ChevronRight className="chev" data-open size={13} aria-hidden />
                </span>
                <Folder size={15} aria-hidden />
                <span className="side-row__label">golemancy</span>
              </button>
              <div className="project-children">
                <div className="project-empty">{loading ? t`Loading` : t`No saved chats yet`}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar__bottom">
        {popoverOpen ? (
          <SettingsPopover
            theme={theme}
            onOpenSettings={onOpenSettings}
            onThemeChange={onThemeChange}
          />
        ) : null}
        <button
          className="side-row side-row--settings"
          type="button"
          aria-expanded={popoverOpen}
          onClick={() => setPopoverOpen((open) => !open)}
        >
          <span className="side-row__icon">
            <Settings size={16} aria-hidden />
          </span>
          <span className="side-row__label">{t`Settings`}</span>
          <MoreHorizontal size={15} aria-hidden />
        </button>
      </div>
    </aside>
  );
}

interface SettingsPopoverProps {
  theme: Theme;
  onOpenSettings: () => void;
  onThemeChange: (theme: Theme) => void;
}

function SettingsPopover({ theme, onOpenSettings, onThemeChange }: SettingsPopoverProps) {
  const { t } = useLingui();

  return (
    <div className="settings-popover" role="menu" aria-label={t`Settings menu`}>
      <div className="popover-head">
        <Logo size={18} />
        <div>
          <strong>{t`Local desktop`}</strong>
          <span>{t`One workspace on this Mac`}</span>
        </div>
      </div>
      <button className="popover-row" type="button" role="menuitem" onClick={onOpenSettings}>
        <Settings size={15} aria-hidden />
        <span>{t`Settings`}</span>
      </button>
      <div className="popover-divider" />
      <div className="popover-theme" aria-label={t`Theme`}>
        <button type="button" data-active={theme === "light" || undefined} onClick={() => onThemeChange("light")}>
          <Sun size={14} aria-hidden />
          <span>{t`Light`}</span>
        </button>
        <button type="button" data-active={theme === "dark" || undefined} onClick={() => onThemeChange("dark")}>
          <Moon size={14} aria-hidden />
          <span>{t`Dark`}</span>
        </button>
      </div>
    </div>
  );
}

interface ConversationMainProps {
  activeRun: ActiveRunState | null;
  draft: string;
  loading: boolean;
  messages: MessageResource[];
  modelAccessReady: boolean | null;
  runtimeConfig: LocalRuntimeConfig | null;
  selectedProject: ProjectResource | null;
  selectedThread: ThreadResource | null;
  submitting: boolean;
  workspaceError: string | null;
  onCancelRun: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

function ConversationMain({
  activeRun,
  draft,
  loading,
  messages,
  modelAccessReady,
  runtimeConfig,
  selectedProject,
  selectedThread,
  submitting,
  workspaceError,
  onCancelRun,
  onDraftChange,
  onSubmit,
}: ConversationMainProps) {
  const { t } = useLingui();
  const scrollRef = useRef<HTMLDivElement>(null);
  const runBusy = activeRun ? ["queued", "running", "cancelling"].includes(activeRun.status) : false;
  const canSubmit = !!runtimeConfig && modelAccessReady !== false && !runBusy && !submitting && !!draft.trim();
  const projectLabel = selectedProject?.name ?? "golemancy";

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTo({ top: node.scrollHeight });
    }
  }, [messages.length, activeRun?.assistantDraft, activeRun?.events.length]);

  return (
    <section className="main conversation" aria-label={t`Conversation`}>
      <header className="conversation-topbar">
        <div className="conversation-title">
          <strong>{selectedThread?.title ?? t`New chat`}</strong>
        </div>
      </header>

      {workspaceError ? (
        <div className="error-strip">
          <WifiOff size={15} aria-hidden />
          <span>{workspaceError}</span>
        </div>
      ) : null}

      <div className="conversation-body" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <div className="empty-state">
            <LoaderCircle size={18} aria-hidden />
            <span>{t`Loading chats`}</span>
          </div>
        ) : messages.length === 0 && !activeRun ? (
          <div className="empty-state empty-state--ready">
            <Logo size={36} />
            <strong>{t`Start a new chat`}</strong>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {activeRun && !messages.some((message) => message.runId === activeRun.runId && message.role === "assistant") ? (
              <LiveAssistantMessage activeRun={activeRun} />
            ) : null}
          </div>
        )}
      </div>

      <form
        className="composer"
        aria-label={t`Message composer`}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            onSubmit();
          }
        }}
      >
        <textarea
          aria-label={t`Message`}
          className="composer__input"
          disabled={!runtimeConfig || submitting || runBusy}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSubmit) {
                onSubmit();
              }
            }
          }}
          placeholder={runtimeConfig ? t`Message Golemancy` : t`Preparing Golemancy`}
          rows={3}
          value={draft}
        />
        {modelAccessReady === false ? <div className="composer__notice">{t`Model access is not set up.`}</div> : null}
        <div className="composer__bar">
          <div className="composer__left">
            <button className="chip chip--icon" type="button" aria-label={t`Attach files`}>
              <Paperclip size={15} aria-hidden />
            </button>
            <button className="chip" type="button">
              <Sparkles size={14} aria-hidden />
              <span>{t`Skills`}</span>
            </button>
            <button className="chip" type="button">
              <Folder size={14} aria-hidden />
              <span>{projectLabel}</span>
              <ChevronDown size={12} aria-hidden />
            </button>
            <button className="chip" type="button">
              <AtSign size={14} aria-hidden />
              <span>{t`Mention`}</span>
            </button>
          </div>
          <div className="composer__right">
            <button className="chip chip--model" type="button">
              <span className="status-dot status-dot--ok" />
              <span>{t`Default model`}</span>
              <ChevronDown size={12} aria-hidden />
            </button>
            <button className="chip chip--icon" type="button" aria-label={t`Dictate`}>
              <Mic size={15} aria-hidden />
            </button>
            {runBusy ? (
              <button className="chip chip--danger" type="button" onClick={onCancelRun}>
                <Square size={12} aria-hidden />
                <span>{activeRun?.status === "cancelling" ? t`Cancelling` : t`Stop`}</span>
              </button>
            ) : null}
            <button className="send" type="submit" aria-label={t`Send message`} disabled={!canSubmit}>
              {submitting ? <LoaderCircle size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: MessageResource }) {
  const isUser = message.role === "user";
  return (
    <article className="message" data-role={message.role}>
      <div className="message__icon">{isUser ? <User size={15} aria-hidden /> : <Bot size={15} aria-hidden />}</div>
      <div className="message__body">
        <p>{message.content}</p>
      </div>
    </article>
  );
}

function LiveAssistantMessage({ activeRun }: { activeRun: ActiveRunState }) {
  const { t } = useLingui();
  const failed = activeRun.status === "failed";
  const cancelled = activeRun.status === "cancelled";

  return (
    <article className="message" data-role="assistant" data-live data-status={failed ? "failed" : cancelled ? "cancelled" : undefined}>
      <div className="message__icon">
        <Bot size={15} aria-hidden />
      </div>
      <div className="message__body">
        {activeRun.assistantDraft ? (
          <p>{activeRun.assistantDraft}</p>
        ) : failed ? (
          <p className="message__notice">{formatRunFailure(activeRun.error, t)}</p>
        ) : cancelled ? (
          <p className="message__notice">{t`Response stopped.`}</p>
        ) : (
          <div className="message__pending" aria-label={t`Preparing response`}>
            <LoaderCircle size={14} aria-hidden />
          </div>
        )}
      </div>
    </article>
  );
}

function mergeRunEvent(current: ActiveRunState | null, runId: string, event: RunEvent): ActiveRunState {
  const base =
    current && current.runId === runId
      ? current
      : {
          runId,
          status: "queued" as RunStatus,
          events: [],
          assistantDraft: "",
          lastSequence: 0,
        };

  if (base.events.some((candidate) => candidate.sequence === event.sequence)) {
    return base;
  }

  const delta = readPayloadString(event.payload, "delta");
  const finalOutput = readPayloadString(event.payload, "finalOutput");
  const assistantDraft = finalOutput ?? (delta ? `${base.assistantDraft}${delta}` : base.assistantDraft);
  const error = event.type === "run.failed" ? readPayloadString(event.payload, "message") ?? base.error : base.error;

  return {
    ...base,
    status: runStatusFromEvent(event, base.status),
    events: [...base.events, event],
    assistantDraft,
    error,
    lastSequence: Math.max(base.lastSequence, event.sequence),
  };
}

function runStatusFromEvent(event: RunEvent, fallback: RunStatus): RunStatus {
  if (event.type === "run.created") {
    return "queued";
  }
  if (event.type === "run.started" || event.type === "text.delta" || event.type === "usage.updated") {
    return "running";
  }
  if (event.type === "tool.call.approval_required") {
    return "waiting_for_approval";
  }
  if (event.type === "run.completed") {
    return "completed";
  }
  if (event.type === "run.failed") {
    return "failed";
  }
  if (event.type === "run.cancelled") {
    return "cancelled";
  }
  return fallback;
}

function isTerminalRunEvent(event: RunEvent): boolean {
  return event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled";
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function createThreadTitle(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= 54) {
    return compact || "New chat";
  }
  return `${compact.slice(0, 54)}...`;
}

async function fetchRuntimeStatus(config: LocalRuntimeConfig, errorMessage: string): Promise<RuntimeStatusResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/health`, {
        headers: {
          authorization: `Bearer ${config.authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(errorMessage);
      }

      return (await response.json()) as RuntimeStatusResponse;
    } catch (cause) {
      lastError = cause;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(errorMessage);
}

async function retryLocalRequest<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await request();
    } catch (cause) {
      lastError = cause;
      if (!isTransientLocalRequestError(cause)) {
        throw cause;
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function isTransientLocalRequestError(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }
  return cause.message === "Load failed" || cause.message === "Failed to fetch";
}

function readErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message) {
    if (isModelAccessError(cause.message)) {
      return "Model access is not configured";
    }
    if (cause.message === "Load failed" || cause.message === "Failed to fetch") {
      return fallback;
    }
    return cause.message;
  }
  return fallback;
}

function isModelAccessReady(status: RuntimeStatusResponse | null): boolean | null {
  const component = status?.components.find((candidate) => candidate.name === "model-access");
  if (!component) {
    return status ? true : null;
  }
  return component.status === "ok";
}

function formatRunFailure(error: string | undefined, t: ReturnType<typeof useLingui>["t"]): string {
  if (error && isModelAccessError(error)) {
    return t`Model access is not set up.`;
  }
  return t`The response could not be completed.`;
}

function isModelAccessError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("model access") || normalized.includes("api key") || normalized.includes("provider api key");
}

function componentLabel(name: string, t: ReturnType<typeof useLingui>["t"]): string {
  if (name === "sidecar") {
    return t`Desktop service`;
  }
  if (name === "database") {
    return t`Local storage`;
  }
  if (name === "browser-extension") {
    return t`Browser connection`;
  }
  if (name === "runtime-engines") {
    return t`Assistant capability`;
  }
  if (name === "model-access") {
    return t`Model access`;
  }
  return t`Service`;
}

function componentValue(status: "ok" | "degraded" | "error", t: ReturnType<typeof useLingui>["t"]): string {
  if (status === "ok") {
    return t`Available`;
  }
  if (status === "degraded") {
    return t`Needs attention`;
  }
  return t`Unavailable`;
}

interface SettingsScreenProps {
  activeSection: SettingsSectionId;
  runtimeConfig: LocalRuntimeConfig | null;
  status: RuntimeStatusResponse | null;
  error: string | null;
  loading: boolean;
  theme: Theme;
  onBack: () => void;
  onRefresh: () => void;
  onSectionChange: (section: SettingsSectionId) => void;
  onThemeChange: (theme: Theme) => void;
}

function SettingsScreen({
  activeSection,
  runtimeConfig,
  status,
  error,
  loading,
  theme,
  onBack,
  onRefresh,
  onSectionChange,
  onThemeChange,
}: SettingsScreenProps) {
  const { t } = useLingui();
  const sectionLabels: Record<SettingsSectionId, string> = {
    general: t`General`,
    appearance: t`Appearance`,
    runtime: t`Connection`,
    "local-data": t`Local data`,
    security: t`Security`,
    about: t`About`,
  };

  return (
    <section className="settings-screen" aria-label={t`Settings`}>
      <aside className="settings-nav">
        <button className="back-row" type="button" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden />
          <span>{t`Back to app`}</span>
        </button>
        <nav className="settings-list" aria-label={t`Settings sections`}>
          {settingsSections.map((section) => (
            <button
              className="settings-item"
              data-active={section.id === activeSection || undefined}
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
            >
              <section.icon size={15} aria-hidden />
              <span>{sectionLabels[section.id]}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="settings-main">
        <div className="settings-inner">
          <SettingsContent
            activeSection={activeSection}
            runtimeConfig={runtimeConfig}
            status={status}
            error={error}
            loading={loading}
            theme={theme}
            onRefresh={onRefresh}
            onThemeChange={onThemeChange}
          />
        </div>
      </main>
    </section>
  );
}

interface SettingsContentProps {
  activeSection: SettingsSectionId;
  runtimeConfig: LocalRuntimeConfig | null;
  status: RuntimeStatusResponse | null;
  error: string | null;
  loading: boolean;
  theme: Theme;
  onRefresh: () => void;
  onThemeChange: (theme: Theme) => void;
}

function SettingsContent({
  activeSection,
  runtimeConfig,
  status,
  error,
  loading,
  theme,
  onRefresh,
  onThemeChange,
}: SettingsContentProps) {
  const { t } = useLingui();
  const { locale, locales, setLocale } = useGolemancyI18n();

  if (activeSection === "appearance") {
    return (
      <>
        <SettingsTitle title={t`Appearance`} description={t`Theme and language controls for the desktop workbench.`} />
        <SettingsGroup label={t`Theme`}>
          <div className="theme-grid">
            <ThemeCard
              active={theme === "light"}
              icon={<Sun size={18} />}
              label={t`Light`}
              mode="light"
              onClick={() => onThemeChange("light")}
            />
            <ThemeCard
              active={theme === "dark"}
              icon={<Moon size={18} />}
              label={t`Dark`}
              mode="dark"
              onClick={() => onThemeChange("dark")}
            />
          </div>
        </SettingsGroup>
        <SettingsGroup label={t`Language`}>
          <div className="locale-list">
            {locales.map((option) => (
              <button
                className="locale-row"
                data-active={option.locale === locale || undefined}
                key={option.locale}
                type="button"
                onClick={() => void setLocale(option.locale)}
              >
                <div>
                  <strong>{option.nativeLabel}</strong>
                  <span>{option.englishLabel}</span>
                </div>
                {option.locale === locale ? <CheckCircle2 size={16} aria-label={t`Active`} /> : null}
              </button>
            ))}
          </div>
        </SettingsGroup>
      </>
    );
  }

  if (activeSection === "runtime") {
    return (
      <>
        <SettingsTitle
          title={t`Connection`}
          description={t`Local workspace availability and connected services.`}
          action={<RefreshButton onClick={onRefresh} />}
        />
        <SettingsGroup label={t`Health`}>
          <InfoRow title={t`Status`} value={status && !error ? t`Connected` : loading ? t`Checking` : t`Not connected`} />
          <InfoRow title={t`App version`} value={status?.appVersion ?? t`Unknown`} />
          <InfoRow title={t`Desktop service`} value={status || runtimeConfig ? t`Available` : t`Unknown`} />
          <InfoRow title={t`Started`} value={status ? formatDateTime(status.startedAt, locale) : t`Not connected`} />
          <InfoRow title={t`Uptime`} value={status ? formatDuration(status.uptimeSeconds, locale) : t`Not connected`} />
          {error ? <InfoRow tone="error" title={t`Last error`} value={error} /> : null}
        </SettingsGroup>
        <SettingsGroup label={t`Components`}>
          {(status?.components ?? []).length > 0 ? (
            status?.components.map((component) => (
              <InfoRow
                key={component.name}
                title={componentLabel(component.name, t)}
                value={componentValue(component.status, t)}
                meta={component.status === "ok" ? t`OK` : component.status === "degraded" ? t`Degraded` : t`Error`}
              />
            ))
          ) : (
            <InfoRow title={t`Services`} value={t`Waiting for connection check`} />
          )}
        </SettingsGroup>
      </>
    );
  }

  if (activeSection === "local-data") {
    return (
      <>
        <SettingsTitle title={t`Local data`} description={t`Read-only locations currently used by this workspace.`} />
        <SettingsGroup label={t`Storage`}>
          <InfoRow title={t`Workspace data`} value={runtimeConfig ? t`Stored on this device` : t`Waiting for desktop app`} />
          <InfoRow title={t`Storage status`} value={status?.database.opened ? t`Ready` : t`Not connected`} />
          <InfoRow title={t`Access`} value={t`Local to this Mac`} />
        </SettingsGroup>
      </>
    );
  }

  if (activeSection === "security") {
    return (
      <>
        <SettingsTitle title={t`Security`} description={t`Local-first trust boundaries that are real in the current desktop client.`} />
        <SettingsGroup label={t`Local access`}>
          <InfoRow title={t`Connection`} value={runtimeConfig ? t`This device only` : t`Waiting for desktop app`} />
          <InfoRow
            title={t`Authentication`}
            value={runtimeConfig ? t`Protected for this desktop session` : t`Not active`}
          />
          <InfoRow title={t`Access scope`} value={t`Limited to this device`} />
        </SettingsGroup>
      </>
    );
  }

  if (activeSection === "about") {
    return (
      <>
        <SettingsTitle title={t`About`} description={t`Product and desktop version details.`} />
        <SettingsGroup label="Golemancy">
          <InfoRow title={t`Product`} value="Golemancy Desktop" />
          <InfoRow title={t`Version`} value={status?.appVersion ?? "0.2.0"} />
          <InfoRow
            title={t`Environment`}
            value={
              status?.environment === "production"
                ? t`production`
                : status?.environment === "test"
                  ? t`test`
                  : t`development`
            }
          />
        </SettingsGroup>
      </>
    );
  }

  return (
    <>
      <SettingsTitle title={t`General`} description={t`Only settings that exist in the current product path are shown here.`} />
      <SettingsGroup label={t`Workspace`}>
        <InfoRow title={t`Current project`} value="golemancy" />
        <InfoRow title={t`Desktop mode`} value={t`Local-first workbench`} />
        <InfoRow title={t`Connection`} value={status && !error ? t`Connected` : loading ? t`Checking` : t`Not connected`} />
      </SettingsGroup>
      <SettingsGroup label={t`Available controls`}>
        <InfoRow title={t`Appearance`} value={t`Theme and language switching`} />
        <InfoRow title={t`Connection refresh`} value={t`Manual connection check for this workspace`} />
      </SettingsGroup>
    </>
  );
}

interface SettingsTitleProps {
  title: string;
  description: string;
  action?: ReactNode;
}

function SettingsTitle({ title, description, action }: SettingsTitleProps) {
  return (
    <header className="settings-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

interface SettingsGroupProps {
  label: string;
  children: ReactNode;
}

function SettingsGroup({ label, children }: SettingsGroupProps) {
  return (
    <section className="settings-group">
      <h2>{label}</h2>
      <div className="settings-group__body">{children}</div>
    </section>
  );
}

interface InfoRowProps {
  title: string;
  value: string;
  meta?: string;
  tone?: "error";
}

function InfoRow({ title, value, meta, tone }: InfoRowProps) {
  return (
    <div className="info-row" data-tone={tone}>
      <div>
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      <code>{value}</code>
    </div>
  );
}

interface ThemeCardProps {
  active: boolean;
  icon: ReactNode;
  label: string;
  mode: Theme;
  onClick: () => void;
}

function ThemeCard({ active, icon, label, mode, onClick }: ThemeCardProps) {
  const { t } = useLingui();

  return (
    <button className="theme-card" data-active={active || undefined} type="button" onClick={onClick}>
      <div className="theme-card__preview" data-mode={mode}>
        <div />
        <span />
        <span />
      </div>
      <div className="theme-card__label">
        {icon}
        <strong>{label}</strong>
        {active ? <CheckCircle2 size={16} aria-label={t`Active`} /> : null}
      </div>
    </button>
  );
}

interface RefreshButtonProps {
  onClick: () => void;
}

function RefreshButton({ onClick }: RefreshButtonProps) {
  const { t } = useLingui();

  return (
    <button className="refresh-button" type="button" onClick={onClick}>
      <RefreshCw size={14} aria-hidden />
      <span>{t`Refresh`}</span>
    </button>
  );
}

interface SideRowProps {
  active?: boolean;
  icon: ReactNode;
  label: string;
  kbd?: string;
  onClick?: () => void;
}

function SideRow({ active = false, icon, label, kbd, onClick }: SideRowProps) {
  return (
    <button className="side-row" data-active={active || undefined} type="button" onClick={onClick}>
      <span className="side-row__icon">{icon}</span>
      <span className="side-row__label">{label}</span>
      {kbd ? <span className="kbd">{kbd}</span> : null}
    </button>
  );
}

interface SectionLabelProps {
  children: ReactNode;
  onCreateProject: () => void;
}

function SectionLabel({ children, onCreateProject }: SectionLabelProps) {
  const { t } = useLingui();

  return (
    <div className="side-section">
      <span>{children}</span>
      <button className="ghost-icon" type="button" aria-label={t`New project`} onClick={onCreateProject}>
        <FolderPlus size={14} aria-hidden />
      </button>
    </div>
  );
}

interface LogoProps {
  size?: number;
}

function Logo({ size = 22 }: LogoProps) {
  return (
    <img className="logo" src={logoImage} width={size} height={size} alt="" aria-hidden />
  );
}
