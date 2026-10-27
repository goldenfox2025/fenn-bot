import type { AvatarKind, Bot } from './model';

export const avatars: { id: AvatarKind; name: string }[] = [
  { id: 'fox', name: '狐狸' }, { id: 'owl', name: '猫头鹰' },
  { id: 'cat', name: '猫' }, { id: 'bear', name: '熊' },
  { id: 'robot', name: '机器人' }, { id: 'rabbit', name: '兔子' },
  { id: 'penguin', name: '企鹅' }, { id: 'raccoon', name: '浣熊' },
  { id: 'initials', name: '名字' },
];
export function validAvatar(value: unknown): value is AvatarKind {
  return avatars.some(avatar => avatar.id === value);
}
export function nextAvatar(bots: Pick<Bot, 'avatar'>[]): AvatarKind {
  return avatars.find(avatar => avatar.id !== 'initials' && !bots.some(bot => bot.avatar === avatar.id))?.id || 'initials';
}
/** Migrate once and persist, rather than deriving identities from list positions. */
export function assignAvatars(bots: Bot[]) {
  const assigned = bots.filter(bot => validAvatar(bot.avatar));
  for (const bot of bots) if (!validAvatar(bot.avatar)) {
    bot.avatar = nextAvatar(assigned); assigned.push(bot);
  }
}
