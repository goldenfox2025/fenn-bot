import { describe, it, expect } from 'vitest';
import { GroupChats, mentionedMembers } from '../src/main/GroupChats';
import type { Bot, GroupChat } from '../src/shared/model';
import { assignAvatars } from '../src/shared/avatars';
import { groupHostId } from '../src/shared/groupHost';

const identity = (id: string, name = id): Bot => ({ id, name, instructions: '', backendId: 'fixture', messages: [], status: 'idle' });
function setup() {
  const bots = [identity('main', 'Fenn'), identity('ann', 'Ann'), identity('anna', 'Anna'), identity('space', 'Code Review')];
  const groups: GroupChat[] = [], calls: { id: string; text: string }[] = [];
  let run = async (_id: string, _text: string) => {};
  const manager = new GroupChats({ groups: () => groups, bots: () => bots, changed() {}, send: async (id, text) => { calls.push({ id, text }); await run(id, text); }, stop: async () => {} });
  return { bots, groups, calls, manager, setRun: (fn: typeof run) => { run = fn; } };
}
describe('shared chat routing', () => {
  it('shares host selection between member edits, creation and the recipient preview', () => {
    expect(groupHostId(['ann','main'],'main')).toBe('main');
    expect(groupHostId(['ann','anna'],'main','main')).toBe('ann');
    expect(groupHostId(['main','ann'],'main','ann')).toBe('ann');
  });
  it('deletes a stalled room without removing its direct Bot identities', async () => {
    const { manager, bots, groups, setRun } = setup(), group = manager.create('Delete', bots.slice(0,2).map(bot=>bot.id));
    setRun(()=>new Promise(()=>{}));
    const work=manager.send(group.id,'Wait');
    await manager.remove(group.id);await work;
    expect(groups).toEqual([]);expect(bots).toHaveLength(4);
    await expect(manager.send(group.id,'Late message')).rejects.toThrow('不存在');
  });
  it('matches exact and quoted mentions without prefix collisions', () => {
    const { bots } = setup();
    expect(mentionedMembers('@Anna check', bots)).toEqual(['anna']);
    expect(mentionedMembers('@"Code Review" check, @Ann', bots)).toEqual(['space', 'ann']);
  });
  it('keeps distinct defaults after reordering and honors chosen avatars', () => {
    const bots = Array.from({ length: 8 }, (_, i) => identity(String(i)));
    assignAvatars(bots); expect(new Set(bots.map(bot => bot.avatar)).size).toBe(8);
    const before = bots.map(bot => bot.avatar); bots.reverse(); assignAvatars(bots);
    expect(bots.toReversed().map(bot => bot.avatar)).toEqual(before);
  });
  it('defaults to host, permits focused delegation, rejects loops before posting and preserves attribution', async () => {
    const { manager, bots, calls, setRun } = setup(), group = manager.create('Review', bots.slice(0, 3).map(bot => bot.id));
    setRun(async id => {
      const actor = manager.actor(id)!;
      if (actor.identityId === 'main') manager.request(id, 'ann', 'Check the result');
      else {
        const count = group.messages.length;
        expect(() => manager.request(id, 'main', 'Loop')).toThrow();
        expect(group.messages).toHaveLength(count);
      }
      manager.deliver(id, { id, role: 'assistant', at: Date.now(), blocks: [{ kind: 'text', text: actor.name + ' done' }] });
    });
    await manager.send(group.id, 'Please investigate');
    expect(calls).toHaveLength(2);
    expect(group.messages.filter(message => message.senderBotId === 'ann')).toHaveLength(1);
    expect(group.actors.every(actor => actor.roomId === group.id && actor.id !== actor.identityId)).toBe(true);
  });
  it('stop releases a stalled round and rejects late deliveries', async () => {
    const { manager, bots, setRun } = setup(), group = manager.create('', bots.slice(0, 2).map(bot => bot.id));
    setRun(() => new Promise(() => {}));
    const work = manager.send(group.id, 'Wait');
    await manager.stop(group.id); await work;
    expect(() => manager.deliver(group.actors[0].id, { id: 'late', role: 'assistant', at: 1, blocks: [] })).toThrow('已停止');
    await manager.update(group.id, { name: 'Stopped' });
    expect(group.name).toBe('Stopped');
  });
});
