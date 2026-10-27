import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { AvatarKind, Bot } from '../../shared/model';
import { avatars } from '../../shared/avatars';
import { BotAvatar } from './BotAvatar';

export function BotAppearance({ identity, onAvatar, onColor }: { identity: Pick<Bot,'id'|'name'|'avatar'|'color'>; onAvatar(value: AvatarKind): void; onColor(value: string): void }) {
  return <div className="bot-appearance">
    <fieldset className="avatar-picker"><legend>头像</legend><div>{avatars.map(item=><button key={item.id} type="button" aria-label={item.name} title={item.name} aria-pressed={identity.avatar===item.id} onClick={()=>onAvatar(item.id)}><BotAvatar bot={identity} avatar={item.id} size={36}/></button>)}</div></fieldset>
    <fieldset className="color-picker"><legend>颜色</legend><div>
      {[['','默认'],['#284e68','蓝'],['#4e6274','石板'],['#596c51','绿'],['#776387','紫'],['#985d59','玫瑰'],['#98733e','琥珀']].map(([value,label])=><button key={label} type="button" aria-label={label} title={label} aria-pressed={(identity.color||'')===value} onClick={()=>onColor(value)} style={{background:value||'var(--bot-face)',color:value?'#fff':'var(--bot-eye)'}}>{(identity.color||'')===value&&<Check size={14}/>}</button>)}
      <label className="custom-color" title="自选颜色" style={{'--custom-color':identity.color||'#284e68'} as CSSProperties}><input type="color" aria-label="自选颜色" value={identity.color||'#284e68'} onChange={event=>onColor(event.target.value)}/><span>自选</span></label>
    </div></fieldset>
  </div>;
}
