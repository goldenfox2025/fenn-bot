import type { AvatarKind, Bot } from '../../shared/model';
import type { CSSProperties } from 'react';
import { BotFace } from './BotFace';

/** One identity component for navigation, messages, progress and settings. */
export function BotAvatar({ bot, avatar = bot?.avatar || 'fox', size = 32, animated = false }: {
  bot?: Pick<Bot, 'avatar' | 'name' | 'id' | 'color'>; avatar?: AvatarKind; size?: number; animated?: boolean;
}) {
  const color = bot?.color && /^#[0-9a-f]{6}$/i.test(bot.color) ? bot.color : undefined;
  const light = color && [.2126,.7152,.0722].reduce((sum, weight, i) => sum + weight * (parseInt(color.slice(1+i*2,3+i*2),16)/255)**2.2, 0) > .45;
  const style = { '--avatar-size': `${size}px`, ...(color ? { '--bot-face': color, '--bot-eye': light ? '#18252f' : '#f7fafc', '--bot-cheek': light ? 'rgb(0 0 0 / 10%)' : 'rgb(255 255 255 / 14%)' } : {}) } as CSSProperties;
  if (avatar === 'fox') return <span className="bot-avatar-art" style={style} data-avatar="fox"><BotFace size={size} animated={animated} /></span>;
  const head = {
    owl: 'M12 20Q10 12 16 13L24 17Q32 13 40 17L48 13Q54 12 52 20V37Q52 55 32 55T12 37Z',
    cat: 'M12 33L12 14Q13 10 17 14L25 21Q32 18 39 21L47 14Q51 10 52 14V33Q56 53 32 55Q8 53 12 33Z',
    bear: 'M13 24C-1 13 17 2 24 17Q32 14 40 17C47 2 65 13 51 24Q57 33 52 44Q48 55 32 55T12 44Q7 33 13 24Z',
    robot: 'M20 18H44Q53 18 53 27V45Q53 54 44 54H20Q11 54 11 45V27Q11 18 20 18Z',
    rabbit: 'M18 28C6 1 26 -2 28 25H36C38 -2 58 1 46 28Q55 35 49 47Q45 55 32 55T15 47Q9 35 18 28Z',
    penguin: 'M12 39Q12 9 32 9T52 39Q54 56 32 56T12 39Z',
    raccoon: 'M13 24Q5 13 13 11Q20 9 24 18Q32 15 40 18Q44 9 51 11Q59 13 51 24Q58 34 51 45Q44 55 32 55T13 45Q6 34 13 24Z',
    initials: 'M16 9H48Q57 9 57 18V46Q57 55 48 55H16Q7 55 7 46V18Q7 9 16 9Z',
  }[avatar];
  const initials = Array.from(bot?.name?.trim() || 'Bot').slice(0, 2).join('');
  return <svg style={style} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" data-avatar={avatar} className={'bot-avatar-art' + (animated ? ' is-alive' : '')}>
    {avatar === 'robot' && <path d="M32 18V10M8 30V41M56 30V41" stroke="var(--bot-face)" strokeWidth="4" strokeLinecap="round" />}
    <path d={head} fill="var(--bot-face)" />
    {avatar === 'initials' ? <text x="32" y="39" textAnchor="middle" fill="var(--bot-eye)" fontSize="21" fontWeight="600">{initials}</text> : <>
      {avatar === 'owl' ? <><circle cx="23" cy="33" r="10" fill="var(--bot-cheek)" /><circle cx="41" cy="33" r="10" fill="var(--bot-cheek)" /></> :
        avatar === 'robot' ? <rect x="17" y="26" width="30" height="18" rx="7" fill="var(--bot-cheek)" /> :
        avatar === 'penguin' ? <path d="M32 28C13 12 9 52 32 52S51 12 32 28Z" fill="var(--bot-cheek)" /> :
        avatar === 'raccoon' ? <path d="M12 30Q22 24 32 32Q42 24 52 30L47 41Q39 44 32 37Q25 44 17 41Z" fill="var(--bot-cheek)" /> :
        <ellipse cx="32" cy="42" rx={avatar === 'bear' ? 12 : 16} ry="10" fill="var(--bot-cheek)" />}
      <g className="avatar-eyes" fill="var(--bot-eye)"><circle cx="23" cy="34" r="2" /><circle cx="41" cy="34" r="2" /></g>
      {avatar === 'robot' ? <path d="M28 47H36" stroke="var(--bot-eye)" strokeWidth="2" strokeLinecap="round" /> :
        <path d={avatar === 'owl' || avatar === 'penguin' ? 'M28 41L32 46L36 41Z' : 'M29 43Q32 40 35 43L32 46Z'} fill="var(--bot-eye)" />}
    </>}
  </svg>;
}
