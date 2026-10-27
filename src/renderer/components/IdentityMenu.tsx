import { useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Settings2 } from 'lucide-react';
import { api } from '../api';
import { Dialog } from './Dialog';

export interface IdentityTarget { id: string; name: string; group: boolean }
export interface MenuTarget extends IdentityTarget { x: number; y: number; anchor: HTMLElement }

/** Native top-layer dismissal, using the same menu material as the composer. */
export function IdentityMenu({ target, onClose, onRename, onSettings }: { target: MenuTarget; onClose(): void; onRename(target: IdentityTarget): void; onSettings(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showPopover();
    el.style.left = Math.max(8, Math.min(target.x, innerWidth-el.offsetWidth-8))+'px';
    el.style.top = Math.max(8, Math.min(target.y, innerHeight-el.offsetHeight-8))+'px';
    el.querySelector<HTMLElement>('button')?.focus({preventScroll:true});
    const dismiss = () => el.hidePopover();
    window.addEventListener('resize', dismiss);
    return () => window.removeEventListener('resize', dismiss);
  }, [target]);
  return <div ref={ref} popover="auto" role="menu" aria-label={target.name} className="input-menu identity-menu"
    onToggle={event => { if (!event.currentTarget.matches(':popover-open')) { onClose(); if (document.activeElement === document.body) target.anchor.focus({preventScroll:true}); } }}
    onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();ref.current?.hidePopover();target.anchor.focus({preventScroll:true});}
      if (['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
        event.preventDefault(); const buttons=[...event.currentTarget.querySelectorAll('button')], index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus({preventScroll:true});
      }
    }}>
    <button role="menuitem" onClick={() => {onClose();onRename(target);}}><Pencil size={16}/>重命名</button>
    <button role="menuitem" onClick={() => {onClose();onSettings();}}><Settings2 size={16}/>{target.group ? '群聊设置' : 'Bot 设置'}</button>
  </div>;
}

export function RenameIdentity({ target, onDone, onError }: { target: IdentityTarget; onDone(): void; onError(text: string): void }) {
  const [name,setName]=useState(target.name), [saving,setSaving]=useState(false), [error,setError]=useState('');
  return <Dialog title={target.group ? '重命名群聊' : '重命名 Bot'} onClose={onDone}><form onSubmit={async event => {
    event.preventDefault();setSaving(true);setError('');
    try {if(target.group) await api().updateGroup(target.id,{name});else await api().updateBot(target.id,{name});onDone();}
    catch(error){setError(String((error as Error).message));onError('');}finally{setSaving(false);}
  }}><label className="field">名称<input className="input" data-autofocus value={name} maxLength={80} required onFocus={event=>event.target.select()} onChange={event=>setName(event.target.value)}/></label>{error&&<p className="inline-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="btn" type="button" onClick={onDone}>取消</button><button className="btn primary" disabled={saving||!name.trim()}>保存</button></div></form></Dialog>;
}
