import { useEffect, useState, type CSSProperties } from "react";
import {
  Plus,
  Search,
  X,
  ArrowUp,
  Square,
  LoaderCircle,
  Users,
  Plug,
} from "lucide-react";
import type { Snapshot } from "../shared/model";
import { api } from "./api";
import { usePanelFocus } from "./usePanelFocus";
import { Conversation } from "./components/Conversation";
import { ApprovalCard } from "./components/ApprovalCard";
import { Inspector, type InspectorTab } from "./components/Inspector";
import { Dialog } from "./components/Dialog";
import { BotEditor } from "./components/BotEditor";
import { Settings } from "./components/Settings";
import { MessageInput } from "./components/MessageInput";
import { BotFace } from "./components/BotFace";
import { ComposerActions } from "./components/ComposerActions";
import { RuntimeSettings } from "./components/RuntimeSettings";
import { SearchBots } from "./components/SearchBots";
import { FoxAvatar } from "@fenn-ui/components/FoxAvatar";
import { useWorkspaceResize } from "./components/PaneResize";
import { usePanePresence } from '@fenn-ui/components/usePanePresence';
import { WindowButtons } from '@fenn-ui/components/WindowButtons';
import { BotAvatar } from './components/BotAvatar';
import { GroupEditor } from './components/GroupEditor';
import { GroupAvatar } from './components/GroupAvatar';
import { IdentityMenu, RenameIdentity, type IdentityTarget, type MenuTarget } from './components/IdentityMenu';

type Surface = "create" | "settings" | "edit" | "runtime" | "search" | 'group' | 'editGroup';
const titles: Record<Surface, string> = {
  create: "创建新 Bot",
  settings: "连接与权限",
  edit: "Bot 设置",
  runtime: "模型与后端",
  search: "搜索",
  group: '新建群聊', editGroup: '群聊设置',
};
export function App() {
  const [contextMenu, setContextMenu] = useState<MenuTarget | null>(null), [renaming, setRenaming] = useState<IdentityTarget | null>(null);
  const [recordMember, setRecordMember] = useState('');
  const [state, setState] = useState<Snapshot>(),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(
      () => localStorage.getItem("bot:selected") || "",
    );
  const [inspectorWanted, setInspector] = useState(false),
    [overlayRequested, setOverlayRequested] = useState(false),
    [dialog, setDialog] = useState<Surface | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const sidebar = useWorkspaceResize(inspectorWanted);
  const inspector = inspectorWanted && (sidebar.canDock || overlayRequested);
  const inspectorPresence = usePanePresence(inspector);
  useEffect(() => {
    setOverlayRequested(false);
  }, [sidebar.viewport]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("bot:drafts") || "{}");
    } catch {
      return {};
    }
  });
  const load = () =>
    api()
      .snapshot()
      .then(setState)
      .catch((error) => setError(String(error.message || error)));
  useEffect(() => {
    void load();
    return api().subscribe(setState);
  }, []);
  const group = state?.groups.find(group => group.id === selected);
  const direct = state?.bots.find(bot => bot.id === selected) || state?.bots.find(bot => bot.id === group?.hostId) || state?.bots[0];
  const bot = group && direct ? { ...direct, id: group.id, name: group.name, avatar: 'initials' as const, messages: group.messages,
    status: group.actors.find(actor => ['running', 'waiting', 'stopping'].includes(actor.status))?.status || 'idle' as const,
    error: group.actors.find(actor => actor.error)?.error } : direct;
  useEffect(() => {
    if (!bot) return;
    setSelected(bot.id);
    localStorage.setItem("bot:selected", bot.id);
    if (group) return;
    if (
      state?.backends.find((backend) => backend.id === bot.backendId)
        ?.installed !== false
    )
      void api()
        .prepare(bot.id)
        .catch(() => {});
  }, [
    bot?.id,
    bot?.backendId,
    bot?.instructions,
    state?.config.computerEnabled,
    group?.id,
  ]);
  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.config.theme;
  }, [state?.config.theme]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setDialog('search'); }
      if (event.key.toLowerCase() === 'b') { event.preventDefault(); sidebar.toggleNav(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sidebar.rail, sidebar.viewport]);
  usePanelFocus(inspectorPresence.present && !sidebar.canDock, ".task-inspector", () =>
    setInspector(false),
  );
  const act = (work: Promise<unknown>) =>
    void work.catch((error) => setError(String(error.message || error)));
  const open = (surface: Surface) => {
    setError("");
    setDialog(surface);
  };
  const showRecords = () => {
    setInspector(true);
    setOverlayRequested(true);
    setInspectorTab("details");
    setRecordMember(group?.actors.find(actor => ['running','waiting','stopping'].includes(actor.status))?.identityId || '');
  };
  if (!state)
    return (
      <main className="startup" aria-live="polite">
        <BotFace size={52} />
        <h1>Fenn Bot</h1>
        <p>{error || "正在打开对话…"}</p>
        {error && (
          <button className="btn" onClick={() => void load()}>
            重试
          </button>
        )}
      </main>
    );
  const busy = !!bot && ["running", "waiting", "stopping"].includes(bot.status),
    draft = bot ? drafts[bot.id] || "" : "";
  const writeDraft = (id: string, text: string, restore = false) => {
    setDrafts(previous => {
      const next = { ...previous, [id]: restore ? previous[id] || text : text };
      localStorage.setItem("bot:drafts", JSON.stringify(next));
      return next;
    });
  };
  const setDraft = (text: string) => { if (bot) writeDraft(bot.id, text); };
  const send = () => {
    if (!bot || busy || !draft.trim()) return;
    const text = draft;
    setDraft("");
    setError("");
    void (group ? api().sendGroup(group.id, text) : api().send(bot.id, text))
      .catch((error) => {
        writeDraft(bot.id, text, true);
        setError(String(error.message || error));
      });
  };
  const approvals = state.approvals.filter(
    (request) => group ? group.actors.some(actor => actor.id === request.botId) : request.botId === bot?.id,
  );
  const backend = state.backends.find(
      (backend) => backend.id === bot?.backendId,
    ),
    model = bot?.catalog?.models?.find(
      (model) => model.id === (bot.modelId || bot.catalog?.currentModelId),
    );
  return (
    <div
      style={{ ...sidebar.style, '--details-track': inspector && sidebar.canDock ? `${sidebar.detailWidth}px` : '0px' } as CSSProperties}
      className={
        "bot-app platform-" +
        (api().platform || "win32") +
        (sidebar.rail ? ' nav-rail' : '') +
        (inspectorPresence.present ? " inspect-open" : "") + (inspector ? ' details-open' : '') + (!sidebar.canDock ? ' inspector-page' : '')
      }
    >
      <div className="window-dragbar" aria-hidden="true" />
      {api().platform === 'win32' && <WindowButtons className="bot-window-buttons" onAction={action => api().windowControl(action)} />}
      <aside className="bot-sidebar" aria-label="Bot">
        {sidebar.leftHandle}
        <div className="brand">
          <button
            className="icon-btn"
            aria-label="搜索对话"
            title="搜索"
            onClick={() => open("search")}
          >
            <Search size={17} />
          </button>
          <button
            className="icon-btn"
            aria-label="新建 Bot"
            title="新建 Bot"
            onClick={() => open("create")}
          >
            <Plus size={20} />
          </button>
        </div>
        <nav className="bot-list" aria-label="你的 Bot">
          {state.bots.map((item, index) => (
            <button
              key={item.id}
              className={"bot-item" + (index === 0 ? ' primary-bot' : ' conversation-item') + (bot?.id === item.id ? " selected" : "")}
              aria-current={bot?.id === item.id ? "page" : undefined}
              title={item.name}
              onContextMenu={event => {event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setContextMenu({id:item.id,name:item.name,group:false,x:event.clientX||rect.right,y:event.clientY||rect.top,anchor:event.currentTarget});}}
              onClick={() => {
                setSelected(item.id);
                if (!sidebar.canDock) setInspector(false);
              }}
            >
              <span className="bot-avatar">
                <BotAvatar bot={item} size={index === 0 ? 56 : 40} />
                {state.approvals.some(
                  (request) => request.botId === item.id,
                ) ? (
                  <span className="status-dot waiting" aria-label="等待许可" />
                ) : item.status === "running" ? (
                  <LoaderCircle size={12} className="avatar-status spin" />
                ) : null}
              </span>
              <span className="bot-item-label">
                <strong>{item.name}</strong>
                {index > 0 && <small>{item.messages.findLast(message => message.channel !== 'activity')?.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join(' ').replace(/\s+/g,' ')}</small>}
              </span>
            </button>
          ))}
          {state.groups.map(item => <button key={item.id} className={'bot-item conversation-item group-item' + (group?.id === item.id ? ' selected' : '')} aria-current={group?.id === item.id ? 'page' : undefined} title={item.name} onContextMenu={event => {event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setContextMenu({id:item.id,name:item.name,group:true,x:event.clientX||rect.right,y:event.clientY||rect.top,anchor:event.currentTarget});}} onClick={() => { setSelected(item.id); if (!sidebar.canDock) setInspector(false); }}>
            <GroupAvatar members={state.bots.filter(bot => item.memberIds.includes(bot.id))} /><span className="bot-item-label"><strong>{item.name}</strong><small>{item.messages.at(-1)?.blocks.flatMap(block=>block.kind==='text'?[block.text]:[]).join(' ').replace(/\s+/g,' ') || `${item.memberIds.length} 位成员`}</small></span>
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="icon-btn rail-create" title="新建 Bot" aria-label="新建 Bot" onClick={() => open('create')}><Plus size={21} /></button>
          {!sidebar.rail && <span className="profile-button sidebar-profile" aria-label="本地用户"><FoxAvatar size={25} /></span>}
          <button className="icon-btn" title="新建群聊" aria-label="新建群聊" onClick={() => open('group')}><Users size={19} /></button>
          {sidebar.rail ? <button
            className="profile-button"
            aria-label="连接与权限"
            title="偏好设置"
            onClick={() => open("settings")}
          >
            <FoxAvatar size={23} />
          </button> : <button className="sidebar-action" aria-label="连接与权限" onClick={() => open('settings')}><Plug size={15} /><span>连接与权限</span></button>}
        </div>
      </aside>
      <main className="bot-main" inert={inspectorPresence.present && !sidebar.canDock} aria-hidden={inspectorPresence.present && !sidebar.canDock || undefined}>
        <header className="conversation-head">
          <button
            className="heading-name"
            aria-label={group ? '查看群聊详情' : '查看 Bot 详情'}
            title={group ? '查看群聊详情' : '查看 Bot 详情'}
            aria-expanded={inspector}
            aria-controls="bot-inspector"
            onClick={() => { setInspectorTab("details"); setOverlayRequested(true); setInspector(!inspector); }}
          >
            {group ? <GroupAvatar members={state.bots.filter(member => group.memberIds.includes(member.id))} size={26} /> : <BotAvatar bot={bot} size={23} />}
            <strong>{bot?.name || "Fenn Bot"}</strong>
          </button>
        </header>
        {bot ? (
          <>
            <Conversation key={bot.id} bot={bot} progressBot={group?.actors.find(actor => ['running','waiting','stopping'].includes(actor.status)) || bot} members={group ? state.bots.filter(member => group.memberIds.includes(member.id)) : undefined} blocked={!!approvals.length} onInspect={showRecords} />
            <div className="composer-area">
              {!!approvals.length && (
                <ApprovalCard
                  key={approvals[0].id}
                  request={approvals[0]}
                  more={approvals.length - 1}
                  onAnswer={(answer) => api().decide(approvals[0].id, answer)}
                />
              )}
              {(error || bot.error) && (
                <div className="inline-error" role="alert">
                  <span>{error || bot.error}</span>
                  {error ? (
                    <button
                      className="icon-btn"
                      aria-label="关闭错误提示"
                      onClick={() => setError("")}
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() =>
                        act(
                          api()
                            .stop(group?.actors.find(actor => actor.error)?.id || bot.id)
                            .then(() => group ? undefined : api().prepare(bot.id)),
                        )
                      }
                    >
                      重试
                    </button>
                  )}
                </div>
              )}
              <form
                className="bot-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  send();
                }}
              >
                {group ? <button type="button" className="input-action" aria-label="群聊设置" title="群聊设置" onClick={() => open('editGroup')}><Users size={20} /></button> : <ComposerActions
                  onRuntime={() => open("runtime")}
                  onActivity={showRecords}
                  onSettings={() => open("settings")}
                  onBot={() => open("edit")}
                  description={[backend?.name, model?.name]
                    .filter(Boolean)
                    .join(" · ")}
                />}
                <MessageInput
                  value={draft}
                  name={bot.name}
                  onChange={setDraft}
                  onSend={send}
                  members={group ? state.bots.filter(member => group.memberIds.includes(member.id)) : undefined}
                />
                {busy ? (
                  <button
                    className="send-button stop"
                    type="button"
                    aria-label="停止任务"
                    onClick={() => act(group ? api().stopGroup(group.id) : api().stop(bot.id))}
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="发送消息"
                    disabled={!draft.trim() || backend?.installed === false}
                  >
                    <ArrowUp size={18} />
                  </button>
                )}
              </form>
            </div>
          </>
        ) : (
          <div className="empty-conversation">
            <BotFace size={72} />
            <h1>Fenn Bot</h1>
            <p>创建一个 Bot，开始对话。</p>
            <button className="btn primary" onClick={() => open("create")}>
              创建 Bot
            </button>
          </div>
        )}
      </main>
      {inspectorPresence.present && (
        <Inspector
          state={state}
          bot={bot}
          group={group}
          focusMember={recordMember}
          onClose={() => setInspector(false)}
          onRevoke={id => bot && act(api().revoke(id || bot.id))}
          onEdit={() => open(group ? 'editGroup' : 'edit')}
          tab={inspectorTab}
          onTab={setInspectorTab}
          resizeHandle={sidebar.rightHandle}
          exiting={inspectorPresence.exiting}
          pageMode={!sidebar.canDock}
        />
      )}
      {contextMenu && <IdentityMenu target={contextMenu} onClose={() => setContextMenu(null)} onRename={setRenaming} onSettings={() => {setSelected(contextMenu.id);open(contextMenu.group ? 'editGroup' : 'edit');}} />}
      {renaming && <RenameIdentity target={renaming} onDone={() => setRenaming(null)} onError={setError} />}
      {dialog && (
        <Dialog title={titles[dialog]} onClose={() => setDialog(null)}>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {dialog === 'group' || dialog === 'editGroup' ? <GroupEditor group={dialog === 'editGroup' ? group : undefined} state={state} onDone={id => { setSelected(id); setDialog(null); }} onError={setError} /> : dialog === "settings" ? (
            <Settings state={state} onError={setError} />
          ) : dialog === "search" ? (
            <SearchBots
              bots={state.bots}
              groups={state.groups}
              onPick={(id) => {
                setSelected(id);
                setDialog(null);
              }}
            />
          ) : dialog === "runtime" && bot ? (
            <RuntimeSettings
              bot={bot}
              state={state}
              onError={setError}
              onDone={() => setDialog(null)}
            />
          ) : (
            <BotEditor
              bot={dialog === "edit" ? bot : undefined}
              state={state}
              onDone={(id) => {
                setSelected(id);
                setDialog(null);
              }}
              onError={setError}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}
