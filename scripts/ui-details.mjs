// Deterministic follow-up over a completed UI fixture; no model prompts.
import { _electron as electron } from 'playwright-core';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const fixture=process.argv[2];
if(!fixture || !existsSync(join(fixture,'state.json')))throw Error('Pass a completed Bot UI fixture.');
const data=mkdtempSync(join(tmpdir(),'fenn-bot-details-'));
for(const name of ['state.json','backends.json','bots'])if(existsSync(join(fixture,name)))cpSync(join(fixture,name),join(data,name),{recursive:true});
const state=JSON.parse(readFileSync(join(data,'state.json'),'utf8'));
state.config.theme='light';writeFileSync(join(data,'state.json'),JSON.stringify(state));
mkdirSync('test-results/details',{recursive:true});
const app=await electron.launch({args:['.'],env:{...process.env,FENN_BOT_DATA:data,FENN_BOT_BACKGROUND:'1',FENN_BOT_TEST:'1'}});
let page;
try {
page=await app.firstWindow();page.setDefaultTimeout(8000);await page.locator('.bot-app').waitFor();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.locator('.bot-item').filter({hasText:'Fenn'}).click();
const replies=page.locator('.message.assistant');assert(await replies.count()>1);
await replies.first().locator('.copy-message').focus();await replies.nth(1).hover();
assert.equal(await page.locator('.message[data-actions-active]').count(),1,'focus plus hover shows exactly one copy toolbar');
assert.equal(await replies.first().locator('.copy-message').evaluate(el=>getComputedStyle(el).opacity),'0');
await page.getByRole('button',{name:'查看 Bot 详情',exact:true}).click();
assert(await page.locator('.operation-run').count()>0);
await page.locator('.bot-item').filter({hasText:'研究助手'}).click();
assert.equal(await page.locator('.operation-run').count(),0,'operation history changes with its owner');
await page.getByRole('radio',{name:'记忆',exact:true}).check();await page.locator('.memory-empty').waitFor();
await page.locator('.bot-item').filter({hasText:'Fenn'}).click();
await page.getByRole('radio',{name:'记忆',exact:true}).check();await page.locator('.memory-fact-toggle').waitFor();
await page.locator('.memory-fact-toggle').click();await page.getByRole('button',{name:'删除',exact:true}).click();
await page.locator('.memory-delete').getByRole('button',{name:'删除',exact:true}).click();await page.locator('.memory-empty').waitFor();
for(const [theme,width,height] of [['light',1040,763],['dark',680,700]]) {
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]),[width,height]);
  await page.evaluate(theme=>window.bot.configure({theme}),theme);
  if (!await page.locator('.task-inspector').count()) await page.getByRole('button',{name:'查看 Bot 详情',exact:true}).click();
  await page.getByRole('radio',{name:'详情',exact:true}).check();
  await page.getByRole('button',{name:'添加定期任务',exact:true}).click();
  await page.getByRole('textbox',{name:'名称',exact:true}).fill('每周整理');
  await page.getByRole('textbox',{name:'任务指令',exact:true}).fill('只整理待办，不访问其他应用。');
  const footer=page.locator('.routine-form .memory-form-actions');
  const bounds=await footer.boundingBox();const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  assert(bounds.y>=0 && bounds.y+bounds.height<=viewport.height+1,'form actions stay within the panel viewport');
  const time=page.getByRole('combobox',{name:'运行时间',exact:true});
  const before=await page.locator('.conversation-history').evaluate(el=>el.scrollTop);
  await time.click();const popup=page.locator('.select-list:popover-open');await popup.waitFor();
  const r=await popup.boundingBox();assert(r.x>=0 && r.x+r.width<=viewport.width+1 && r.y>=0 && r.y+r.height<=viewport.height+1);
  await time.press('Escape');assert.equal(await page.locator('.conversation-history').evaluate(el=>el.scrollTop),before);
  const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  writeFileSync(`test-results/details/${theme}-${width}-routine.png`,Buffer.from(png,'base64'));
  await page.getByRole('button',{name:'取消',exact:true}).click();
}
await page.emulateMedia({reducedMotion:'reduce'});
assert.equal(await page.locator('.fox-avatar').first().evaluate(el=>{el.classList.add('is-alive');return getComputedStyle(el.querySelector('.fox-eyes')).animationName}),'none');
assert.deepEqual(errors,[]);
console.log('PASS single copy toolbar, per-Bot records/memory, memory deletion, visible form actions, dropdown placement/scroll and reduced motion.');
} catch(error) {await page.screenshot({path:'test-results/details/failure.png'}).catch(()=>{});console.error(error.stack||error);throw error;} finally {await app.close();}
