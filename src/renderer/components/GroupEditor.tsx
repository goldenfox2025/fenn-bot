import { useState } from 'react';
import { Check } from 'lucide-react';
import type { GroupChat, Snapshot } from '../../shared/model';
import { api } from '../api';
import { BotAvatar } from './BotAvatar';

export function GroupEditor({ group, state, onDone, onError }: { group?: GroupChat; state: Snapshot; onDone(id: string): void; onError(text: string): void }) {
  const [name, setName] = useState(group?.name || ''), [members, setMembers] = useState(group?.memberIds || state.bots.slice(0, 2).map(bot => bot.id)), [saving, setSaving] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault(); setSaving(true);
    try { if (group) { await api().updateGroup(group.id, { name, memberIds: members }); onDone(group.id); }
      else onDone((await api().createGroup(name, members)).id);
    } catch (error) { onError(String((error as Error).message)); } finally { setSaving(false); }
  }}>
    <label className="field">群聊名称<input className="input" data-autofocus value={name} onChange={event => setName(event.target.value)} placeholder="可选，默认使用成员名称" maxLength={80} /></label>
    <fieldset className="group-members"><legend>选择成员 <small>{members.length} / 8</small></legend>
      {state.bots.map(bot => <label key={bot.id} className="group-member-choice"><BotAvatar bot={bot} size={34} /><span>{bot.name}</span><input type="checkbox" checked={members.includes(bot.id)} disabled={!members.includes(bot.id) && members.length >= 8} onChange={event => setMembers(event.target.checked ? [...members, bot.id] : members.filter(id => id !== bot.id))} /><Check size={16} aria-hidden="true" /></label>)}
      {state.bots.length < 2 && <p className="muted">先创建另一个 Bot，再把它们加入群聊。</p>}
    </fieldset>
    <div className="dialog-actions"><span className="muted">未 @ 成员时，由{state.bots.find(bot => bot.id === (group?.hostId || members[0]))?.name || '第一个成员'}接收消息。</span><button className="btn primary" disabled={saving || members.length < 2}>{saving ? '正在保存…' : group ? '保存' : '创建群聊'}</button></div>
  </form>;
}
