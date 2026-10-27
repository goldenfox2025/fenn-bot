// Real Electron/ACP lifecycle, isolated profile and deterministic agent; no paid model.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const data = mkdtempSync(join(tmpdir(), 'fenn-lifecycle-')), fixture = join(data, 'agent.mjs');
const source = readFileSync('resources/fenn/mock-agent.mjs', 'utf8').replace('    const text = userText(raw);', `
    await callTool(sessionId,s,'send_user_message',{text:'已收到并完成本次检查。',client_id:'lifecycle-reply'});
    return {stopReason:'end_turn'};
    const text = userText(raw);`);
writeFileSync(fixture, source);
writeFileSync(join(data, 'backends.json'), JSON.stringify([{id:'fixture',name:'Fixture',command:process.execPath,args:[fixture]}, {id:'fixture-alt',name:'Alternate',command:process.execPath,args:[fixture]}]));
const bot = (id, name) => ({id,name,backendId:'fixture',instructions:'',status:'idle',messages:[]});
writeFileSync(join(data,'state.json'), JSON.stringify({bots:[bot('main','Fenn'),bot('helper','研究助手'),bot('third','设计助手')],groups:[{id:'team',name:'审查小组',hostId:'main',memberIds:['helper','main','third'],actors:[],messages:[{id:'room-message',role:'user',at:Date.now(),blocks:[{kind:'text',text:'群内独有的检索词'}]}],createdAt:Date.now()}],config:{theme:'light',browserMode:'isolated',computerEnabled:false,cdpUrl:'http://127.0.0.1:9333'},backendSettings:{}}));
mkdirSync('test-results/lifecycle',{recursive:true});
let app, page;
const errors=[];
const launch = async () => {
  app = await electron.launch({args:['.'],env:{...process.env,FENN_BOT_DATA:data,FENN_BOT_BACKGROUND:'1',FENN_BOT_TEST:'1'}});
  page = await app.firstWindow(); page.setDefaultTimeout(8000); page.on('pageerror', error=>errors.push(error.message));
  await page.locator('.bot-app').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1240,850));
};
const snapshot = () => page.evaluate(()=>window.bot.snapshot());
const pick = name => page.locator('.bot-list .bot-item').filter({has:page.locator(`.bot-item-label`,{hasText:name})}).first().click();
const close = () => page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
const settings = async () => {await page.getByRole('button',{name:'连接与权限',exact:true}).click();await page.getByRole('dialog').waitFor();};
const groupSettings = async () => {await pick('审查小组');await page.locator('.bot-composer').getByRole('button',{name:'群聊设置',exact:true}).click();};
const choose = async (label, option) => {await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();};
const runtime = async () => {await page.getByRole('button',{name:'输入框操作',exact:true}).click();await page.getByRole('menuitem',{name:'模型与后端',exact:true}).click();};
const shot = async name => {
  await page.evaluate(()=>Promise.allSettled(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished)));
  const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));
  writeFileSync(`test-results/lifecycle/${name}.png`,Buffer.from(png,'base64'));
};
try {
  await launch();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox',{name:'搜索 Bot、群聊或消息',exact:true});
  await search.fill('审查小组');await page.locator('.search-results').getByRole('button',{name:'审查小组',exact:true}).waitFor();await shot('search-groups-light');await page.locator('.search-results').getByRole('button',{name:'审查小组',exact:true}).click();
  assert.equal(await page.locator('.heading-name strong').textContent(),'审查小组');
  await page.keyboard.press('Control+k');await search.fill('群内独有的检索词');
  await page.locator('.search-results').getByRole('button').filter({hasText:'审查小组'}).click();
  console.log('PASS search finds group names and shared messages');

  await groupSettings();await page.getByRole('checkbox',{name:'Fenn',exact:true}).uncheck();
  await page.getByText('未 @ 成员时，由研究助手接收消息。',{exact:true}).waitFor();
  await shot('group-host-preview-light');
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  assert.equal((await snapshot()).groups[0].hostId,'helper');
  await page.getByRole('textbox',{name:'发消息',exact:true}).fill('请检查群聊路由。');await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.locator('.message.assistant').filter({hasText:'已收到并完成本次检查。'}).waitFor();
  await page.waitForFunction(async()=> (await window.bot.snapshot()).groups[0].actors.every(actor=>actor.status==='idle'));
  assert((await snapshot()).bots.every(bot=>bot.messages.length===0),'group reply cannot leak into a private chat');
  console.log('PASS edited host preview matches actual ACP recipient and private chats remain clean');

  await pick('Fenn');await settings();await page.getByRole('button',{name:'添加 ACP 后端',exact:true}).click();
  await page.getByRole('textbox',{name:'名称',exact:true}).fill('Lifecycle backend');
  await page.getByRole('textbox',{name:'程序路径',exact:true}).fill(process.execPath);
  const args=page.getByRole('textbox',{name:'参数（JSON 数组）',exact:true});await args.fill('{invalid');
  await page.getByRole('button',{name:'添加连接',exact:true}).click();await page.getByRole('dialog').getByRole('alert').waitFor();
  assert(!(await snapshot()).backends.some(backend=>backend.name==='Lifecycle backend'));
  await args.fill(JSON.stringify([fixture]));await page.getByRole('button',{name:'添加连接',exact:true}).click();
  await page.locator('.connection-list strong').filter({hasText:'Lifecycle backend'}).waitFor();await close();
  await page.getByRole('button',{name:'新建 Bot',exact:true}).click();await page.getByPlaceholder('这个 Bot 叫什么？').fill('生命周期助手');
  await choose('Agent 后端','Lifecycle backend');await page.getByRole('button',{name:'创建 Bot',exact:true}).click();
  await page.locator('.message.assistant').waitFor();
  await page.waitForFunction(async()=> (await window.bot.snapshot()).bots.find(bot=>bot.name==='生命周期助手').status==='idle');
  const created=(await snapshot()).bots.find(bot=>bot.name==='生命周期助手'), customBackend=created.backendId;
  await runtime();const models=created.catalog.models;
  await choose('模型',models.at(-1).name);
  const thought=created.catalog.options.find(option=>option.category==='thought_level');
  await choose(thought.name,thought.choices.at(-1).name);
  await choose('Agent 后端','Alternate');await page.getByRole('combobox',{name:'模型',exact:true}).waitFor();
  await choose('Agent 后端','Lifecycle backend');
  await page.waitForFunction(({id,model,effort,key})=>window.bot.snapshot().then(state=>{const bot=state.bots.find(bot=>bot.id===id);return bot.modelId===model&&bot.optionValues?.[key]===effort}),{id:created.id,model:models.at(-1).id,key:thought.id,effort:thought.choices.at(-1).value});
  await page.getByRole('button',{name:'完成',exact:true}).click();
  console.log('PASS malformed backend input is rejected; valid custom backend, onboarding and per-backend model/effort restore work');

  await page.evaluate(async id=>{await window.bot.saveMemory(id,{name:'审查偏好',description:'检查重启恢复',type:'user',body:'先核对事实。'});await window.bot.saveRoutine(id,{name:'稍后检查',prompt:'检查本地待办。',schedule:{kind:'once',at:Date.now()+86400000},enabled:false});},created.id);
  const humanCount=(await snapshot()).bots.find(bot=>bot.id===created.id).messages.filter(message=>message.role==='user'&&message.channel!=='activity').length;
  await page.getByRole('button',{name:'查看 Bot 详情',exact:true}).click();
  await page.getByRole('button',{name:'稍后检查 的操作',exact:true}).click();await page.getByRole('button',{name:'立即运行',exact:true}).click();
  await page.waitForFunction(async id=>{const state=await window.bot.snapshot();return state.routines.some(routine=>routine.botId===id&&routine.lastRunAt)&&state.bots.find(bot=>bot.id===id).status==='idle';},created.id);
  assert.equal((await snapshot()).bots.find(bot=>bot.id===created.id).messages.filter(message=>message.role==='user'&&message.channel!=='activity').length,humanCount,'scheduled dispatch is an activity record, never an invented human chat');
  await shot('scheduled-dispatch-records');
  await page.getByRole('button',{name:'收起侧面板',exact:true}).click();
  console.log('PASS manual scheduled work executes through ACP, records its outcome and does not impersonate a human message');
  await page.getByRole('textbox',{name:'发消息',exact:true}).fill('重启后仍保留的草稿');
  await app.close();await launch();
  const restored=(await snapshot()).bots.find(bot=>bot.id===created.id);
  assert.equal(restored.backendId,customBackend);assert.equal(restored.modelId,models.at(-1).id);assert.equal(restored.optionValues[thought.id],thought.choices.at(-1).value);
  assert.equal((await page.evaluate(id=>window.bot.listMemory(id),created.id)).length,1);
  assert((await snapshot()).routines.some(routine=>routine.botId===created.id&&routine.name==='稍后检查'));
  await pick('生命周期助手');assert.equal(await page.getByRole('textbox',{name:'发消息',exact:true}).inputValue(),'重启后仍保留的草稿');
  assert((await snapshot()).groups[0].messages.some(message=>message.role==='assistant'));
  console.log('PASS restart preserves custom backend, model/effort, group replies, memory, schedules and per-conversation drafts');

  await pick('研究助手');await page.getByRole('button',{name:'输入框操作',exact:true}).click();await page.getByRole('menuitem',{name:'Bot 设置',exact:true}).click();
  await page.getByRole('button',{name:'删除 Bot',exact:true}).click();await page.getByRole('button',{name:'保留',exact:true}).click();
  assert((await snapshot()).bots.some(bot=>bot.id==='helper'));
  await page.getByRole('button',{name:'删除 Bot',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  assert(!(await snapshot()).bots.some(bot=>bot.id==='helper'));assert.deepEqual((await snapshot()).groups[0].memberIds,['third']);
  await pick('审查小组');await page.getByRole('textbox',{name:'发消息',exact:true}).fill('这条消息暂时不能发送');await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'至少两个群成员'}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'发消息',exact:true}).inputValue(),'这条消息暂时不能发送');
  await groupSettings();await page.getByRole('checkbox',{name:'Fenn',exact:true}).check();await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  await groupSettings();await page.getByRole('button',{name:'删除群聊',exact:true}).click();await page.getByRole('button',{name:'保留',exact:true}).click();
  assert.equal((await snapshot()).groups.length,1);
  await page.evaluate(()=>window.bot.configure({theme:'dark'}));
  await page.getByRole('button',{name:'删除群聊',exact:true}).click();await shot('group-delete-confirm-dark');await page.getByRole('button',{name:'确认删除',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal((await snapshot()).groups.length,0);assert.equal((await snapshot()).bots.length,3);assert.equal((await snapshot()).bots.find(bot=>bot.id===created.id).messages.filter(message=>message.channel!=='activity').length,2);
  console.log('PASS Bot deletion updates memberships, undersized rooms preserve rejected drafts, room repair/deletion retain member Bots and private messages');

  // A delayed transport error must not apply a stale draft map after switching chats.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('bot:send');ipcMain.handle('bot:send',()=>new Promise((_,reject)=>{globalThis.__rejectDraft=()=>reject(Error('Fixture transport failure'));}));});
  await pick('Fenn');await page.getByRole('textbox',{name:'发消息',exact:true}).fill('原对话发送失败的消息');await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await pick('设计助手');await page.getByRole('textbox',{name:'发消息',exact:true}).fill('另一对话新写的草稿');
  await app.evaluate(()=>globalThis.__rejectDraft());await page.getByRole('alert').filter({hasText:'Fixture transport failure'}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'发消息',exact:true}).inputValue(),'另一对话新写的草稿');
  await pick('Fenn');assert.equal(await page.getByRole('textbox',{name:'发消息',exact:true}).inputValue(),'原对话发送失败的消息');
  assert.deepEqual(errors,[]);
  console.log('PASS late send failures restore the original draft without erasing another conversation');
  console.log('BOT_LIFECYCLE_PROFILE '+data);
} catch(error) {
  if(app) {const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64')).catch(()=>null);if(png)writeFileSync('test-results/lifecycle/failure.png',Buffer.from(png,'base64'));}
  throw error;
} finally {if(app)await app.close();}
