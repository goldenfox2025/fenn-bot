import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { Bot, Snapshot } from "../../shared/model";
import { api } from "../api";
import { SelectControl } from "./SelectControl";
import { BotAvatar } from './BotAvatar';
import { nextAvatar } from '../../shared/avatars';
import { BotAppearance } from './BotAppearance';
import { BackendLogo } from '@fenn-ui/components/BackendLogo';

export function BotEditor({
  bot,
  state,
  onDone,
  onError,
}: {
  bot?: Bot;
  state: Snapshot;
  onDone: (id: string) => void;
  onError: (text: string) => void;
}) {
  const [name, setName] = useState(bot?.name || ""),
    [backend, setBackend] = useState(
      bot?.backendId || state.backends.find(backend => backend.id === state.bots[0]?.backendId && backend.installed !== false)?.id || state.backends.find(backend => backend.installed !== false)?.id || "codex",
    ),
    [system, setSystem] = useState(bot?.instructions || ""),
    [avatar, setAvatar] = useState(bot?.avatar || nextAvatar(state.bots)),
    [color, setColor] = useState(bot?.color || ''),
    [appearance, setAppearance] = useState(false),
    [saving, setSaving] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <form className="bot-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          if (bot) {
            await api().updateBot(bot.id, {
              name,
              backendId: backend,
              instructions: system,
              avatar,
              color,
            });
            onDone(bot.id);
          } else {
            const result = await api().createBot(name, backend, system, state.bots[0]?.id, avatar, color || undefined);
            onDone(result.id);
            void api().onboardBot(result.id).catch(error => onError(String(error.message || error)));
          }
        } catch (e) {
          onError(String((e as Error).message));
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="field"><span>名称</span><input data-autofocus className="input" value={name} onChange={event=>setName(event.target.value)} maxLength={80} required placeholder="这个 Bot 叫什么？"/></label>
      <div className="field"><span className="field-label">Agent 后端</span><SelectControl label="Agent 后端" value={backend} onChange={setBackend} options={state.backends.filter(item=>item.installed!==false||item.id===backend).map(item=>({value:item.id,label:item.name+(item.installed===false?' · 未安装':''),icon:<BackendLogo id={item.id} size={16}/>}))}/></div>
      <section className="bot-editor-appearance"><div className="bot-profile-preview"><BotAvatar bot={{id:bot?.id||'new',name,avatar,color}} size={48}/><button className="appearance-toggle" type="button" aria-expanded={appearance} onClick={()=>setAppearance(!appearance)}>头像与颜色<ChevronDown size={14} className={appearance?'open':''}/></button></div>
        {appearance&&<BotAppearance identity={{id:bot?.id||'new',name,avatar,color}} onAvatar={setAvatar} onColor={setColor}/>}
      </section>
      {bot&&<label className="field"><span>长期指令</span><textarea className="textarea" value={system} onChange={event=>setSystem(event.target.value)} rows={4} placeholder="它擅长什么、如何与你合作（可选）"/></label>}
      <div className="dialog-actions">
        {bot && (
          <button
            className="btn danger"
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
            删除 Bot
          </button>
        )}
        <span className="spacer" />
        <button
          className="btn primary"
          disabled={!name.trim() || saving}
          type="submit"
        >
          {saving ? "正在保存…" : bot ? "保存" : "创建 Bot"}
        </button>
      </div>
      {confirmDelete && (
        <div className="delete-confirm" role="alert">
          <p>删除 {bot?.name} 及其本地对话记录？</p>
          <button
            className="btn"
            type="button"
            onClick={() => setConfirmDelete(false)}
          >
            保留
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              try {
                await api().deleteBot(bot!.id);
                onDone(state.bots.find((b) => b.id !== bot!.id)?.id || "");
              } catch (e) {
                onError(String(e));
              }
            }}
          >
            确认删除
          </button>
        </div>
      )}
    </form>
  );
}
