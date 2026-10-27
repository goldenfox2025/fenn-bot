import type { CSSProperties } from 'react';
import type { Bot } from '../../shared/model';
import { BotAvatar } from './BotAvatar';

/** The same member composition identifies a room in navigation, chat and details. */
export function GroupAvatar({ members, size = 40 }: { members: Bot[]; size?: number }) {
  return <span className="group-avatar" style={{ '--group-size': `${size}px` } as CSSProperties} aria-hidden="true">
    {members.slice(0, 2).map(member => <BotAvatar key={member.id} bot={member} size={size * .68} />)}
  </span>;
}
