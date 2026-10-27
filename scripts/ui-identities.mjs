// Deterministic ACP only. Exercise real host routing in an isolated hidden app.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const data = mkdtempSync(join(tmpdir(), 'fenn-identities-ui-'));
const fixture = join(data, 'agent.mjs');
const agent = readFileSync('resources/fenn/mock-agent.mjs', 'utf8').replace('    const text = userText(raw);', `
    if(raw.includes('Your chosen name is')) {
      await callTool(sessionId,s,'send_user_message',{text:'你好，你希望我怎样帮助你？',client_id:'onboarding'});
      return {stopReason:'end_turn'};
    }
    if(raw.includes('[FENN_GROUP_V1]') && raw.endsWith('#hold-group')) {
      notify(sessionId,{sessionUpdate:'tool_call',toolCallId:'group-progress',title:'checking',kind:'read',status:'in_progress'});
      while(!abort.aborted)await new Promise(r=>setTimeout(r,25));
      return {stopReason:'cancelled'};
    }
    if(raw.includes('[FENN_GROUP_V1]')) {
      await callTool(sessionId,s,'send_user_message',{text:'已检查**「关键位置」**，结果清楚。',client_id:'group-answer'});
      return {stopReason:'end_turn'};
    }
    if(raw.includes('#new-bot')) {
      await callTool(sessionId,s,'send_user_message',{text:'新 Bot 的独立会话已收到。',client_id:'new-bot-answer'});
      return {stopReason:'end_turn'};
    }
    const text = userText(raw);`);
writeFileSync(fixture, agent);
writeFileSync(join(data, 'backends.json'), JSON.stringify([{ id: 'fixture', name: 'Fixture', command: process.execPath, args: [fixture] },{ id:'fixture-alt',name:'Second fixture',command:process.execPath,args:[fixture]}]));
const messages = Array.from({ length: 12 }, (_, i) => [
  { id: 'u' + i, role: 'user', at: i, blocks: [{ kind: 'text', text: '问题 ' + i + '：怎样让成员的工作清楚可见？' }] },
  { id: 'a' + i, role: 'assistant', at: i, blocks: [{ kind: 'text', text: '每个成员保持自己的身份和操作记录。\n\n这是第 ' + i + ' 个结果。' }] },
]).flat();
writeFileSync(join(data, 'state.json'), JSON.stringify({ bots: [
  { id: 'main', name: 'Fenn', backendId: 'fixture', instructions: '', status: 'idle', messages },
  { id: 'research', name: '研究助手', backendId: 'fixture', instructions: '', status: 'idle', messages: [] },
], config: { theme: 'light', browserMode: 'isolated', computerEnabled: false, cdpUrl: 'http://127.0.0.1:9333' }, backendSettings: {} }));
const app = await electron.launch({ args: ['.'], env: { ...process.env, FENN_BOT_DATA: data, FENN_BOT_BACKGROUND: '1', FENN_BOT_TEST: '1' } });
const shots = resolve('test-results/identities'); mkdirSync(shots, { recursive: true });
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('.bot-app').waitFor();
  const settle = async () => { await page.evaluate(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }); };
  const shot = async name => { await settle(); const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64')); writeFileSync(join(shots, name + '.png'), Buffer.from(png, 'base64')); };
  const resize = async width => { await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 800), width); await settle(); };
  await resize(1100);
  assert.deepEqual(await page.locator('.bot-list .bot-item [data-avatar]').evaluateAll(elements => elements.map(el => el.dataset.avatar)), ['fox', 'owl']);
  const nodes = page.getByRole('navigation', { name: '对话节点' }); await nodes.waitFor();
  const markers=await nodes.locator('.conversation-node').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().top));
  assert.equal(markers.length,12,'only user messages are indexed');
  assert(markers.slice(1).every((top,i)=>Math.abs(top-markers[i]-10)<.2),'the index has a fixed compact pitch rather than transcript-scaled gaps');
  await shot('dense-message-index');
  await nodes.locator('.conversation-node').first().hover(); await page.locator('.node-preview').waitFor();
  assert(await page.evaluate(()=>{const marker=document.querySelector('.conversation-node:hover').getBoundingClientRect(),preview=document.querySelector('.node-preview').getBoundingClientRect();return Math.abs((marker.top+marker.bottom-preview.top-preview.bottom)/2)<2}),'Bot preview centers on its message node');
  await page.getByRole('button', { name: '添加书签', exact: true }).click();
  assert.equal(await nodes.locator('.saved').count(), 1); await nodes.locator('.node-prompt').click();
  await page.waitForFunction(() => document.querySelector('.conversation-history').scrollTop < 80);
  await nodes.locator('.conversation-node').first().focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.node-preview').count(), 0);
  const bottom = page.getByRole('button', { name: '回到最新', exact: true });
  await page.locator('.conversation-history').evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })); await bottom.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '新建 Bot', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '创建 Bot', exact: true }).isEnabled(),false);
  await page.getByPlaceholder('这个 Bot 叫什么？').fill('代码助手');
  await page.getByRole('combobox',{name:'Agent 后端',exact:true}).click();await page.getByRole('option',{name:'Second fixture',exact:true}).click();
  assert.equal(await page.getByRole('dialog').getByRole('textbox').count(),1,'creation requires only a name');
  await page.getByRole('button',{name:'头像与颜色',exact:true}).click();
  await page.getByRole('button', { name: '猫', exact: true }).click();
  await page.getByRole('button',{name:'紫',exact:true}).click(); await shot('avatar-picker');
  await page.getByRole('button', { name: '创建 Bot', exact: true }).click(); await page.locator('dialog').waitFor({ state: 'detached' });
  await page.locator('.message.assistant').filter({hasText:'你好，你希望我怎样帮助你？'}).waitFor();
  await page.waitForFunction(async()=> (await window.bot.snapshot()).bots.find(bot=>bot.name==='代码助手').status==='idle');
  assert.equal(await page.locator('.message.user').count(),0,'onboarding has no invented human message');
  assert.equal(await page.locator('.heading-name [data-avatar]').evaluate(el=>getComputedStyle(el).getPropertyValue('--bot-face').trim()),'#776387');
  assert.equal(await page.evaluate(async()=>(await window.bot.snapshot()).bots.find(bot=>bot.name==='代码助手').backendId),'fixture-alt');
  await page.getByRole('button', { name: '查看 Bot 详情', exact: true }).click(); await settle();
  assert.equal(await page.locator('.heading-name [data-avatar]').getAttribute('data-avatar'), 'cat');
  assert.equal(await page.locator('.inspector-identity [data-avatar]').getAttribute('data-avatar'), 'cat');
  await shot('individual-details');
  await page.getByRole('button', { name: '收起侧面板', exact: true }).click(); await settle();
  await page.getByRole('textbox',{name:'发消息',exact:true}).fill('#new-bot');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.locator('.message.assistant').filter({hasText:'新 Bot 的独立会话已收到。'}).waitFor();
  await page.waitForFunction(async()=> (await window.bot.snapshot()).bots.find(bot=>bot.name==='代码助手').status==='idle');
  await page.getByRole('button', { name: '新建群聊', exact: true }).click();
  await page.getByRole('checkbox',{name:'研究助手'}).uncheck();
  assert.equal(await page.getByRole('button',{name:'创建群聊',exact:true}).isEnabled(),false,'one member is not a group');
  await page.getByRole('checkbox',{name:'研究助手'}).check();
  await page.getByRole('checkbox',{name:'代码助手'}).check();
  assert(await page.locator('.group-member-choice [data-avatar]').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().width<=35&&el.getBoundingClientRect().height<=35)),'all avatar wrappers stay bounded in the group picker');
  await shot('group-member-picker');
  await page.getByPlaceholder('可选，默认使用成员名称').fill('一起检查');
  await page.getByRole('button', { name: '创建群聊', exact: true }).click(); await page.locator('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.empty-conversation h1').count(),0,'empty conversation does not repeat its title');
  assert.equal(await page.locator('.empty-conversation .group-avatar [data-avatar]').count(),2,'empty group uses member avatars instead of a text avatar');
  await shot('group-empty-member-avatars');
  await page.getByRole('textbox',{name:'发消息',exact:true}).fill('@研究助手 #hold-group');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.locator('.task-progress [data-avatar=owl]').waitFor();
  await page.locator('.task-progress').click();
  await page.waitForFunction(()=>document.querySelector('.member-scope button[role=combobox]')?.textContent.includes('研究助手'));
  await shot('group-working-member');
  await page.getByRole('button',{name:'停止任务',exact:true}).click();
  await page.locator('.task-progress').waitFor({state:'detached'});
  await page.getByRole('button',{name:'收起侧面板',exact:true}).click();await settle();
  await page.getByRole('textbox', { name: '发消息', exact: true }).fill('@研');
  await page.getByRole('option', { name: '研究助手' }).click();
  await page.getByRole('textbox', { name: '发消息', exact: true }).fill('@研究助手 检查显示');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.locator('.message.assistant').waitFor();
  assert.equal(await page.locator('.message-sender [data-avatar]').getAttribute('data-avatar'), 'owl');
  assert.equal(await page.locator('.reply-prose strong').textContent(), '「关键位置」');
  await page.waitForFunction(async()=> (await window.bot.snapshot()).groups[0].actors.every(actor=>actor.status==='idle'));
  await page.getByRole('textbox',{name:'发消息',exact:true}).fill('由主持 Bot 接收这条消息');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.locator('.message.assistant').nth(1).waitFor();
  assert.equal(await page.locator('.message.assistant').nth(1).locator('[data-avatar]').getAttribute('data-avatar'),'fox');
  await page.waitForFunction(async()=> (await window.bot.snapshot()).groups[0].actors.every(actor=>actor.status==='idle'));
  await page.getByRole('textbox',{name:'发消息',exact:true}).fill('@代码助手 检查群聊');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.locator('.message.assistant').nth(2).waitFor();
  assert.equal(await page.locator('.message.assistant').nth(2).locator('[data-avatar]').getAttribute('data-avatar'),'cat');
  await page.locator('.conversation-history').dispatchEvent('wheel', { deltaY: -120 });
  await page.locator('.conversation-history').focus(); await page.keyboard.press('Home');
  await page.locator('.conversation-history').evaluate(el=>el.scrollTo({top:el.scrollHeight,behavior:'instant'}));
  await bottom.waitFor({state:'detached'});
  await page.getByRole('button', { name: '查看群聊详情', exact: true }).click(); await settle();
  await page.getByRole('radio',{name:'成员',exact:true}).click();
  await shot('group-members');
  await page.locator('.inspector-members button').filter({hasText:'研究助手'}).click();
  await page.locator('.operation-records').waitFor();
  assert.equal(await page.getByText('收到用户发来的信息：', {exact:false}).count(),0);
  assert.equal(await page.locator('.operation-run').count(), 2);
  await shot('group-light');
  await resize(760); await page.getByRole('button', { name: '查看群聊详情', exact: true }).click(); await shot('group-narrow');
  await page.evaluate(() => window.bot.configure({ theme: 'dark' })); await resize(1100); await shot('group-dark');
  await page.locator('.bot-list .bot-item[title="研究助手"]').click();
  assert.equal(await page.locator('.message.assistant').count(), 0, 'public group reply must not appear in private DM');
  assert.equal(await page.locator('.operation-run').count(), 0, 'group work does not pollute private activity records');
  await page.locator('.bot-list .bot-item[title="代码助手"]').click();
  assert.equal(await page.locator('.message.assistant').count(),2,'new Bot DM retains its welcome and private reply, not group replies');
  await page.locator('.bot-list .bot-item[title="Fenn"]').click();
  await page.locator('.conversation-node.saved').waitFor();
  assert.equal(await page.locator('.conversation-node.saved').count(), 1, 'bookmark survives conversation switch');
  for (const label of ['最小化', '全屏']) { const button = page.locator('.bot-window-buttons').getByRole('button', { name: label }); await button.hover(); assert.notEqual(await button.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)'); }
  await page.locator('.bot-list .bot-item[title="代码助手"]').click({button:'right'});
  await shot('identity-context-menu');
  await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
  await page.getByRole('dialog',{name:'重命名 Bot'}).getByRole('textbox').fill('设计助手');
  await page.getByRole('dialog',{name:'重命名 Bot'}).getByRole('button',{name:'保存',exact:true}).click();
  await page.locator('.bot-list .bot-item[title="设计助手"]').waitFor();
  await page.locator('.bot-list .bot-item[title="一起检查"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
  await page.getByRole('dialog',{name:'重命名群聊'}).getByRole('textbox').fill('设计检查组');
  await page.getByRole('dialog',{name:'重命名群聊'}).getByRole('button',{name:'保存',exact:true}).click();
  await page.locator('.bot-list .bot-item[title="设计检查组"]').waitFor();
  for(let tries=0;tries<40;tries++){if(JSON.parse(readFileSync(join(data,'state.json'),'utf8')).bots.some(bot=>bot.name==='设计助手'))break;await new Promise(resolve=>setTimeout(resolve,50));}
  const saved=JSON.parse(readFileSync(join(data,'state.json'),'utf8'));assert.equal(saved.bots.find(bot=>bot.name==='设计助手').color,'#776387');
  await page.locator('.bot-list .bot-item[title="设计助手"]').click();
  await page.locator('.bot-list .bot-item[title="设计助手"]').click({button:'right'});await page.getByRole('menuitem',{name:'Bot 设置',exact:true}).click();
  const aligned=await page.locator('.bot-editor :is(input.input,.select-trigger,textarea.textarea)').evaluateAll(els=>els.map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));
  assert(aligned.length===3&&aligned.every(rect=>Math.abs(rect.left-aligned[0].left)<1&&Math.abs(rect.right-aligned[0].right)<1),'name/backend/instructions share the same input edges');await shot('bot-settings-aligned-dark');
  await page.getByRole('button',{name:'头像与颜色',exact:true}).click();await shot('bot-settings-appearance-dark');
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  assert.deepEqual(errors, []); console.log('PASS distinct persisted avatars, manual picker, nodes/bookmarks/keyboard, actual group ACP reply/attribution/isolation, member records, themes and window hover. Profile: ' + data);
} catch (error) { await (await app.firstWindow()).screenshot({ path: join(shots, 'failure.png') }).catch(() => {}); throw error; } finally { await app.close(); }
