import { ShieldCheck, Globe, PanelRightClose, Settings2, ArrowLeft, ChevronRight } from "lucide-react";
import { SegmentedControl } from "@fenn-ui/components/SegmentedControl";
import type { Bot, GroupChat, Snapshot } from "../../shared/model";
import { useEffect, useState } from 'react';
import { BotAvatar } from './BotAvatar';
import { GroupAvatar } from './GroupAvatar';
import { SelectControl } from './SelectControl';
import { OperationRecords } from "./OperationRecords";
import { BotFace } from "./BotFace";
import { BotRoutines } from "./BotRoutines";
import { MemoryManager, type MemoryService } from "@fenn-ui/components/MemoryManager";
import { api } from "../api";
import { BrowserView } from '@fenn-ui/components/BrowserView';
import type { BrowserViewService } from '@fenn-shared/browser';
import type { ReactNode } from 'react';
export type InspectorTab = "details" | "memory" | "page" | "permissions" | "members";
const memories: MemoryService = { list: id => api().listMemory(id), save: (id, entry) => api().saveMemory(id, entry), remove: (id, name) => api().deleteMemory(id, name), skills: id => api().listMemorySkills(id), compose: (id, input) => api().composeMemory(id, input) };
const browser: BrowserViewService = { info: id => api().browserInfo(id), frame: id => api().browserFrame(id), stop: id => api().stopBrowser(id) };

export function Inspector({
  state,
  bot: providedBot,
  group,
  focusMember,
  onClose,
  onRevoke,
  onEdit,
  tab,
  onTab,
  resizeHandle,
  exiting,
  pageMode,
}: {
  state: Snapshot;
  bot?: Bot;
  group?: GroupChat;
  focusMember?: string;
  onClose: () => void;
  onRevoke: (id?: string) => void;
  onEdit: () => void;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  resizeHandle: ReactNode;
  exiting?: boolean;
  pageMode?: boolean;
}) {
  const [memberId, setMember] = useState('');
  useEffect(() => { setMember(focusMember || '') }, [group?.id, focusMember]);
  const identity = group ? state.bots.find(bot => bot.id === memberId && group.memberIds.includes(bot.id)) || state.bots.find(bot => bot.id === group.hostId) || state.bots.find(bot => group.memberIds.includes(bot.id)) : undefined;
  const actor = group?.actors.find(bot => bot.identityId === identity?.id);
  const bot = group ? actor || (identity ? { ...identity, id: '', messages: [], error: undefined, status: 'idle' as const } : undefined) : providedBot;
  const preview = state.previews.find((preview) => preview.botId === bot?.id),
    grants = state.grants.filter((grant) => grant.botId === bot?.id),
    desktop = state.desktopGrants.filter((grant) => grant.botId === bot?.id);
  return (
    <aside id="bot-inspector" inert={exiting} aria-hidden={exiting || undefined} data-exiting={exiting || undefined} className="task-inspector" aria-label={group ? '群聊详情' : 'Bot 详情'}>
      {!pageMode && resizeHandle}
      <div className="inspector-viewport">
      <header>
        {pageMode && <button className="icon-btn" aria-label="返回对话" title="返回对话" onClick={onClose}><ArrowLeft size={18} /></button>}
        <strong>{pageMode ? group?.name || providedBot?.name : ''}</strong>
        <button className="icon-btn" aria-label={group ? '群聊设置' : 'Bot 设置'} title={group ? '群聊设置' : 'Bot 设置'} onClick={onEdit}><Settings2 size={16} /></button>
        {!pageMode && <button className="icon-btn" aria-label="收起侧面板" title="收起侧面板" onClick={onClose}>
          <PanelRightClose size={16} />
        </button>}
      </header>
      {group ? <div className="inspector-identity"><GroupAvatar members={state.bots.filter(member=>group.memberIds.includes(member.id))} size={64}/><button onClick={onEdit} title="群聊设置"><h2>{group.name}</h2></button><p>{group.memberIds.length} 位成员</p></div> : bot && <div className="inspector-identity"><BotAvatar bot={bot} size={58} animated={bot.status === "running"} /><button onClick={onEdit} title="编辑 Bot"><h2>{bot.name}</h2></button>{bot.instructions && <p title={bot.instructions}>{bot.instructions}</p>}</div>}
      <div className="inspector-tabs">
        <SegmentedControl
          label="Bot 详情分类"
          value={tab}
          onChange={onTab}
          options={[
            { value: "details", label: "详情" },
            ...(group ? [{value:'members' as const, label:'成员'}] : []),
            { value: "memory", label: "记忆" },
            { value: "page", label: "电脑" },
            { value: "permissions", label: "权限" },
          ]}
        />
      </div>
      <div className="inspector-body">
        {group && tab !== 'members' && <div className="member-scope"><BotAvatar bot={identity} size={24}/><SelectControl label="查看成员" value={identity?.id} options={state.bots.filter(member=>group.memberIds.includes(member.id)).map(member=>({value:member.id,label:member.name}))} onChange={setMember}/></div>}
        {tab === 'members' && group ? <div className="inspector-members">{state.bots.filter(member=>group.memberIds.includes(member.id)).map(member=><button key={member.id} aria-label={`${member.name} · 操作记录`} onClick={()=>{setMember(member.id);onTab('details');}}><BotAvatar bot={member} size={40}/><span><strong>{member.name}</strong><small>{member.id===group.hostId?'主 Bot':state.backends.find(backend=>backend.id===member.backendId)?.name}</small></span><ChevronRight size={15} className="member-link"/></button>)}</div> : tab === "details" ? (
          <>{bot && !group && <BotRoutines key={bot.id} botId={bot.id} routines={(state.routines || []).filter((routine) => routine.botId === bot.id)} />}<div className="section-title records-title"><h2>操作记录</h2></div><OperationRecords bot={bot} /></>
        ) : tab === "memory" && bot ? (
          bot.id ? <MemoryManager scope={bot.id} version={state.memoryVersion?.[bot.id]} service={memories} /> : <p className="muted">这个成员还没有在群里工作。</p>
        ) : tab === "page" ? (
          preview && !preview.url.startsWith('desktop:') && bot ? <BrowserView key={bot.id} ownerId={bot.id} service={browser} /> : preview ? (
            <section className="evidence">
              <div className="section-title">
                <Globe size={15} />
                <h2>{preview.title || "最近页面"}</h2>
              </div>
              <p className="evidence-url">{preview.url}</p>
              {preview.image && (
                <img
                  src={"data:image/png;base64," + preview.image}
                  alt="最近一次操作的截图"
                />
              )}
            </section>
          ) : (
            <div className="computer-idle"><BotFace size={38} /><strong>还没有操作画面</strong><p>这个 Bot 读取网页或屏幕后，最近画面会显示在这里。</p></div>
          )
        ) : (
          <section>
            <div className="section-title">
              <ShieldCheck size={15} />
              <h2>本轮授权</h2>
              {!!(grants.length + desktop.length) && (
                <button className="text-button" onClick={() => onRevoke(bot?.id)}>
                  全部收回
                </button>
              )}
            </div>
            {grants.length + desktop.length ? (
              <ul className="grant-list">
                {grants.map((grant) => (
                  <li key={grant.id}>
                    <span>{grant.target}</span>
                    <small>
                      {grant.capability === "browser.read"
                        ? "查看网页"
                        : "填写和按键"}
                    </small>
                  </li>
                ))}
                {desktop.map((grant) => (
                  <li key={grant.key}>
                    <span>{grant.name}</span>
                    <small>
                      {
                        { view: "仅查看", click: "仅点击", full: "点击和输入" }[
                          grant.tier
                        ]
                      }
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">当前没有本轮授权。操作前会询问你。</p>
            )}
          </section>
        )}
      </div>
      </div>
    </aside>
  );
}
