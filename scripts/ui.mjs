// Hidden Electron + a real headless browser. The ACP agent is a deterministic fixture, never a paid model.
import { _electron as electron } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const data = mkdtempSync(join(tmpdir(), "fenn-bot-ui-"));
mkdirSync("test-results", { recursive: true });
const source = resolve("resources/fenn/mock-agent.mjs");
let agent = readFileSync(source, "utf8");
const hook = `
    if(raw.endsWith('#hold-progress')) {
      notify(sessionId,{sessionUpdate:'tool_call',toolCallId:'progress-fixture',title:'browser_snapshot',kind:'read',status:'in_progress'});
      while(!abort.aborted)await new Promise(r=>setTimeout(r,50));
      return {stopReason:'cancelled'};
    }
    if (raw.endsWith('#ignore-stop')) {
      await new Promise(r=>setTimeout(r,3500));
      notify(sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'STALE_COMPLETION_MUST_NOT_APPEAR'}});
      return {stopReason:'error',error:'STALE_ERROR_MUST_NOT_APPEAR'};
    }
    if (raw.endsWith('#stream-test')) {
      await callTool(sessionId,s,'send_user_message',{text:Array.from({length:65},(_,i)=>'已发送内容 '+i+'：验证阅读位置保持稳定。').join('\\n\\n'),client_id:'long-message'});
      for(let i=0;i<90&&!abort.aborted;i++){
        notify(sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Streaming line '+i+' — verifying stable history scrolling.\\n\\n'}});
        await new Promise(r=>setTimeout(r,55));
      }
      return {stopReason:abort.aborted?'cancelled':'end_turn'};
    }
    if (/#browser-flow https?:\\/\\/[^\\s<]+\\s*$/.test(raw)) {
      const url=[...raw.matchAll(/#browser-flow (https?:\\/\\/[^\\s<]+)/g)].at(-1)?.[1];
      try {
        const opened=await callTool(sessionId,s,'browser_open',{url});
        if(!opened?.elements)throw Error('读取未获许可');
        const field=opened.elements.find(e=>e.tag==='input');
        const filled=await callTool(sessionId,s,'browser_fill',{ref:field.ref,text:'fenn-approved-value'});
        if(!filled?.elements)throw Error('填写未获许可');
        const button=filled.elements.find(e=>e.type==='submit'||e.type==='image');
        let result=await callTool(sessionId,s,'browser_click',{ref:button.ref});
        if(!result?.text)throw Error('提交未获许可');
        for(let i=0;i<4&&!result.text.includes('记录已保存');i++){await new Promise(r=>setTimeout(r,80));result=await callTool(sessionId,s,'browser_snapshot',{});}
        await callTool(sessionId,s,'send_user_message',{text:result.text.includes('记录已保存')?'已验证：页面显示记录已保存。':'页面尚未确认保存，不能报告完成。'});
      } catch(error) { if(!abort.aborted)await callTool(sessionId,s,'send_user_message',{text:'未完成：'+error.message}); }
      return {stopReason:'end_turn'};
    }
`;
agent = agent.replace(
  "    const text = userText(raw);",
  hook + "    const text = userText(raw);",
);
const fixture = join(data, "fixture-agent.mjs");
writeFileSync(fixture, agent);
writeFileSync(
  join(data, "backends.json"),
  JSON.stringify([
    {
      id: "fixture",
      name: "Fixture ACP",
      command: process.execPath,
      args: [fixture],
    },
  ]),
);
const id = randomUUID(),
  other = randomUUID();
writeFileSync(
  join(data, "state.json"),
  JSON.stringify({
    bots: [
      {
        id,
        name: "Fenn",
        instructions: "",
        backendId: "fixture",
        status: "idle",
        messages: [],
      },
      {
        id: other,
        name: "研究助手",
        instructions: "",
        backendId: "fixture",
        status: "idle",
        messages: [],
      },
    ],
    config: {
      browserMode: "isolated",
      computerEnabled: false,
      theme: "light",
      cdpUrl: "http://127.0.0.1:9333",
    },
    backendSettings: {},
  }),
);
let visits = 0,
  submits = 0;
const server = createServer((req, res) => {
  if (req.url === "/submit") {
    submits++;
    res.end("ok");
    return;
  }
  if (req.url === "/") visits++;
  if (req.url === "/image") {
    res.setHeader("content-type", "text/html;charset=utf-8");
    res.end(
      '<!doctype html><meta charset="utf-8"><form action="/submit" method="post"><label>备注<input aria-label="备注" name="note"></label><input type="image" alt="Image action" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2240%22%3E%3Crect width=%2280%22 height=%2240%22 fill=%22gray%22/%3E%3C/svg%3E"></form>',
    );
    return;
  }
  res.setHeader("content-type", "text/html;charset=utf-8");
  res.end(
    '<!doctype html><html lang="zh"><meta charset="utf-8"><title>Fenn local browser acceptance</title><style>body{font:18px system-ui;padding:40px;max-width:620px;background:#faf9f5;color:#242422}input,button{font:inherit;padding:10px;margin:8px 0;display:block}</style><h1>本地浏览器验收</h1><label>备注<input aria-label="备注"></label><button type="submit" onclick="fetch(\'/submit\',{method:\'POST\'}).then(()=>document.querySelector(\'#result\').textContent=\'记录已保存\')">提交记录</button><p id="result">记录未发送</p>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port + "/";
const app = await electron.launch({
  args: [".", "--no-sandbox"],
  timeout: 25000,
  env: {
    ...process.env,
    FENN_BOT_DATA: data,
    FENN_BOT_BACKGROUND: "1",
    FENN_BOT_TEST: "1",
  },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function wait(fn, arg) {
  for (let i = 0; i < 300; i++) {
    if (await page.evaluate(fn, arg)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("state timeout");
}
async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(width, height);
    },
    { width, height },
  );
}
async function compactLabels(context) {
  const wrapped = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "button,.seg-option > span,.bot-item-label strong,.composer-note,.grant-list small,.task-progress-label,.progress-count",
      ),
    ]
      .filter(
        (el) =>
          el.getClientRects().length &&
          getComputedStyle(el).visibility !== "hidden",
      )
      .flatMap((el) => {
        const lines = new Set();
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim())
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects())
            if (rect.width > 0) lines.add(Math.round(rect.top));
        }
        return lines.size > 1
          ? [{ text: el.textContent.trim().slice(0, 100), lines: lines.size }]
          : [];
      }),
  );
  assert.deepEqual(wrapped, [], context + " wrapped control labels");
}
async function openSettings() {
  const button = page.getByRole("button", { name: "连接与权限", exact: true });
  await button.click();
  await page.locator("dialog").waitFor();
}
async function openRuntime() {
  await page.getByRole("button", { name: "输入框操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "模型与后端", exact: true }).click();
  await page.getByRole("dialog", { name: "模型与后端", exact: true }).waitFor();
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
}
async function openRecords() {
  await page.getByRole("button", { name: "查看 Bot 详情", exact: true }).click();
  await page.locator(".task-inspector").waitFor();
  await page.evaluate(async () => { await Promise.allSettled(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}

async function shot(name) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForTimeout(120);
  // Electron's CDP screenshot crop is wrong after page zoom. Capture the full
  // actual WebContents surface for reliable 125/150% visual acceptance.
  const image = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}))
      .toPNG()
      .toString("base64"),
  );
  writeFileSync(
    join("test-results", name + ".png"),
    Buffer.from(image, "base64"),
  );
  const bad = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".bot-main,.bot-composer,.bot-dialog,.approval-card,.composer-controls",
      ),
    ]
      .filter(
        (el) =>
          el.getClientRects().length && el.scrollWidth > el.clientWidth + 2,
      )
      .map((el) => el.className),
  );
  assert.deepEqual(bad, [], name + " horizontal overflow");
  const outside = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".bot-dialog,.bot-composer,.approval-card,.input-menu:popover-open",
      ),
    ]
      .filter((el) => el.checkVisibility())
      .flatMap((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -0.5 ||
          r.right > innerWidth + 1 ||
          r.top < -0.5 ||
          r.bottom > innerHeight + 1
          ? [
              {
                name: el.className,
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
                viewport: [innerWidth, innerHeight],
              },
            ]
          : [];
      }),
  );
  assert.deepEqual(outside, [], name + " surface outside viewport");
}
async function send(text) {
  await page.getByRole("textbox", { name: "发消息", exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
try {
  await page.locator(".bot-app").waitFor();
  assert(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id)?.catalog
        ?.models?.length > 1,
    id,
  );
  await openRuntime();
  const modelControl = page.getByRole('combobox', { name: '模型', exact: true });
  const dialogBounds = await page.locator('.bot-dialog').boundingBox();
  await modelControl.focus();
  await modelControl.press('ArrowDown');
  await page.getByRole('listbox', { name: '模型', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.bot-dialog').boundingBox(), dialogBounds, 'opening a selector never moves its dialog');
  await modelControl.press('End');
  await modelControl.press('Enter');
  await wait(async id => (await window.bot.snapshot()).bots.find(b => b.id === id)?.modelId === 'mock-smart', id);
  await modelControl.press('ArrowDown');
  await modelControl.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 1, 'Escape first closes the selector, not its dialog');
  await modelControl.press('ArrowDown');
  await modelControl.press('Home');
  await modelControl.press('Enter');
  assert.equal(
    await page
      .getByRole("listbox", { name: "模型", exact: true, includeHidden: true })
      .getByRole("option", { includeHidden: true })
      .count(),
    2,
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .getByRole("textbox", { name: "发消息", exact: true })
    .fill("尚未发送的草稿");
  await openRuntime();
  assert.equal(
    (await page.evaluate(() => window.bot.snapshot())).bots[0].messages.length,
    0,
    "opening runtime must not submit the draft",
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "发消息", exact: true })
      .inputValue(),
    "尚未发送的草稿",
  );
  await page.getByRole("textbox", { name: "发消息", exact: true }).fill("");
  await page.keyboard.press("Control+k");
  await wait(
    () =>
      document.activeElement?.getAttribute("aria-label") === "搜索 Bot、群聊或消息",
  );
  await page.keyboard.insertText("研究");
  assert.equal(await page.locator(".search-results button").count(), 1);
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  const beforeMenu = await page.locator(".conversation-history").boundingBox();
  await page.getByRole("button", { name: "输入框操作", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "模型与后端", exact: true })
    .waitFor();
  assert.deepEqual(
    await page.locator(".conversation-history").boundingBox(),
    beforeMenu,
  );
  await page.keyboard.press("End");
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Bot 设置", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await wait(
    () => document.activeElement?.getAttribute("aria-label") === "输入框操作",
  );
  console.log(
    "PASS models are available before the first message and the action menu preserves layout/focus",
  );
  await shot("empty-wide");
  const separator = page.getByRole('separator', { name: '调整 Bot 侧栏宽度' });
  await separator.focus(); await separator.press('End');
  assert.equal(await separator.getAttribute('aria-valuenow'), '320');
  await openRecords();
  assert((await page.locator('.bot-main').boundingBox()).width >= 379, 'opening details preserves a readable conversation');
  const right = page.getByRole('separator', { name: '调整详情侧栏宽度' });
  await right.focus(); await right.press('End');
  assert((await page.locator('.bot-main').boundingBox()).width >= 379, 'right pane cannot crush chat');
  await right.press('Home');
  assert.equal(await right.getAttribute('aria-valuenow'), '300');
  const rightBox = await right.boundingBox();
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2); await page.mouse.down();
  await page.mouse.move(rightBox.x - 34, rightBox.y + rightBox.height / 2); await page.mouse.up();
  const dragged = Number(await right.getAttribute('aria-valuenow'));
  assert(dragged > 300 && dragged <= Number(await right.getAttribute('aria-valuemax')), 'drag grows details within the width left for a readable chat');
  assert.equal(Number(await page.evaluate(() => localStorage.getItem('bot:inspector-width'))), dragged);
  await right.dblclick();
  await shot('details-wide');
  await page.getByRole('radio', { name: '记忆', exact: true }).check();
  await page.getByRole('button', { name: '添加记忆', exact: true }).click();
  await page.getByRole('textbox', { name: '记忆内容', exact: true }).fill('先说结论，再说明必要信息。');
  await page.getByRole('radio', { name: '详情', exact: true }).check();
  await page.getByRole('radio', { name: '记忆', exact: true }).check();
  assert.equal(await page.getByRole('textbox', { name: '记忆内容', exact: true }).inputValue(), '先说结论，再说明必要信息。', 'memory drafts survive tab inspection');
  await shot('memory-input-wide');
  await page.getByRole('button', { name: '整理记忆', exact: true }).click();
  await page.getByRole('button', { name: '保存记忆', exact: true }).waitFor();
  assert.equal((await page.evaluate(id => window.bot.listMemory(id), id)).length, 0);
  await shot('memory-review-wide');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await page.locator('.memory-fact-toggle').filter({ hasText: '先说结论' }).waitFor();
  await shot('memory-wide');
  assert.equal((await page.evaluate(id => window.bot.listMemory(id), other)).length, 0, 'memory does not leak to another Bot');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '记忆内容', exact: true }).fill('尚未保存的修改');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '放弃更改', exact: true }).click();
  assert.equal((await page.evaluate(id => window.bot.listMemory(id), id))[0].body, '先说结论，再说明必要信息。');
  await page.getByRole('radio', { name: '详情', exact: true }).check();
  await page.getByRole('button', { name: '添加定期任务', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('每日回顾');
  await page.getByRole('textbox', { name: '任务指令', exact: true }).fill('整理今天的待办。');
  await shot('routine-editor-wide');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.routine-open').filter({ hasText: '每日回顾' }).waitFor();
  await page.getByRole('button', { name: '每日回顾 的操作', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.locator('.routine-open').filter({ hasText: '已暂停' }).waitFor();
  const routine = (await page.evaluate(() => window.bot.snapshot())).routines[0];
  assert.equal(routine.botId, id); assert.equal(routine.enabled, false);
  await page.getByRole('button', { name: '每日回顾 的操作', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('.routine-empty').waitFor();
  await page.getByRole('button', { name: '收起侧面板', exact: true }).click();
  await separator.focus(); await separator.press('Home');
  assert.equal(await separator.getAttribute('aria-valuenow'), await separator.getAttribute('aria-valuemin'));
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
  const drag = await separator.boundingBox();
  const startWidth = Number(await separator.getAttribute('aria-valuenow'));
  await page.mouse.move(drag.x + drag.width / 2, drag.y + 120); await page.mouse.down();
  await page.mouse.move(drag.x + drag.width / 2 + 276 - startWidth, drag.y + 120); await page.mouse.up();
  assert.equal(await separator.getAttribute('aria-valuenow'), '276');
  assert.equal(await page.evaluate(() => localStorage.getItem('bot:sidebar-width')), '276');
  console.log('PASS selector keyboard/top-layer, sidebar resize, scoped memory drafts/CRUD and scheduled-task management');
  // A denied read must not even navigate to the site.
  await send("#browser-flow " + url);
  await page.locator(".approval-card").waitFor();
  assert.equal(visits, 0);
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert.equal(visits, 0);
  assert.equal(submits, 0);
  console.log("PASS denying browser permission prevents navigation");
  // Approve read + interaction, but not the form submission.
  await send("#browser-flow " + url);
  await page
    .locator(".approval-card")
    .filter({ hasText: "打开网页" })
    .waitFor();
  const geometry = await page.locator(".conversation-history").boundingBox();
  await page.getByRole("button", { name: "本轮允许", exact: true }).click();
  await page
    .locator(".approval-card")
    .filter({ hasText: "填写网页字段" })
    .waitFor();
  assert.deepEqual(
    await page.locator(".conversation-history").boundingBox(),
    geometry,
  );
  assert.match(
    await page.locator(".approval-card").innerText(),
    /fenn-approved-value/,
  );
  await page.getByRole("button", { name: "本轮允许", exact: true }).click();
  await page
    .locator(".approval-card")
    .filter({ hasText: "点击网页元素" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "本轮允许", exact: true }).count(),
    0,
  );
  await shot("sensitive-approval");
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert.equal(submits, 0);
  console.log("PASS interaction grants never authorize a sensitive submission");
  await send("#browser-flow " + url + "image");
  await page
    .locator(".approval-card")
    .filter({ hasText: "打开网页" })
    .waitFor();
  await page.getByRole("button", { name: "本轮允许", exact: true }).click();
  await page
    .locator(".approval-card")
    .filter({ hasText: "填写网页字段" })
    .waitFor();
  await page.getByRole("button", { name: "本轮允许", exact: true }).click();
  await page
    .locator(".approval-card")
    .filter({ hasText: "input · image" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "本轮允许", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert.equal(submits, 0);
  console.log("PASS image-submit forms also require separate confirmation");
  await send("#browser-flow " + url);
  await page
    .locator(".approval-card")
    .filter({ hasText: "打开网页" })
    .waitFor();
  await page.getByRole("button", { name: "本轮允许", exact: true }).click();
  await page
    .locator(".approval-card")
    .filter({ hasText: "填写网页字段" })
    .waitFor();
  await page.getByRole("button", { name: "本轮允许", exact: true }).click();
  await page
    .locator(".approval-card")
    .filter({ hasText: "点击网页元素" })
    .waitFor();
  await page.getByRole("button", { name: "仅本次", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert.equal(submits, 1);
  await openRecords();
  await page.getByRole("radio", { name: "电脑", exact: true }).check();
  await page.locator(".browser-view img").waitFor();
  assert.equal(
    (await page.evaluate(() => window.bot.snapshot())).grants.length,
    0,
  );
  await shot("browser-result");
  assert(
    await page
      .locator(".conversation-history")
      .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 12),
    "opening inspector must keep a following conversation at the latest message",
  );
  console.log(
    "PASS ACP tool calls operate a real browser and return verified evidence",
  );
  await page.getByRole("button", { name: "收起侧面板", exact: true }).click();
  await send("#browser-flow " + url);
  await page.locator(".approval-card").waitFor();
  await page.getByRole("button", { name: "停止任务", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert.equal(await page.locator(".approval-card").count(), 0);
  assert.equal(
    (await page.evaluate(() => window.bot.snapshot())).grants.length,
    0,
  );
  assert.equal(submits, 1);
  console.log("PASS Stop cancels pending approval and revokes grants");
  await send("#hold-progress");
  await page.locator(".task-progress").waitFor();
  assert(await page.locator('.task-progress').evaluate(el => el.parentElement?.classList.contains('message-column') && !el.nextElementSibling), 'progress is the next assistant position, at the tail of the message column');
  assert.equal(await page.locator('.task-progress .lucide-chevron-up').count(), 0);
  assert.equal(
    await page
      .locator(".message .tool-trace,.message .thought,.progress-count")
      .count(),
    0,
  );
  await compactLabels("working progress");
  const headerRect = await page.locator('.conversation-head').boundingBox(), historyRect = await page.locator('.conversation-history').boundingBox();
  assert(historyRect.y >= headerRect.y + headerRect.height, 'scrolling chat cannot paint under the header');
  await page.locator(".task-progress").click();
  await page.locator(".operation-run").first().waitFor();
  await page
    .locator(".operation-run")
    .last()
    .locator(":scope > summary")
    .focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.locator('.task-inspector').getAttribute('aria-modal'), null, 'integrated details are a normal sidebar');
  assert.equal(await page.locator('.bot-main').evaluate(el => el.inert), false, 'wide details keep chat interactive');
  await shot("bottom-progress");
  await page.getByRole("button", { name: "收起侧面板", exact: true }).click();
  await page.getByRole("button", { name: "停止任务", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert.equal(
    await page.locator(".message.assistant").last().locator(".spin").count(),
    0,
  );
  console.log(
    "PASS transient progress follows messages and stopped tools lose their spinner",
  );
  // A backend ignoring cancellation cannot freeze the UI or complete a new task.
  await send("#ignore-stop");
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "running",
    id,
  );
  await new Promise((r) => setTimeout(r, 250));
  const stopAt = Date.now();
  await page.getByRole("button", { name: "停止任务", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  assert(Date.now() - stopAt < 2200);
  await send("#browser-flow " + url);
  await page.locator(".approval-card").waitFor();
  await new Promise((r) => setTimeout(r, 3800));
  assert.equal(
    await page.evaluate(
      (id) =>
        window.bot
          .snapshot()
          .then((s) => s.bots.find((b) => b.id === id).status),
      id,
    ),
    "waiting",
  );
  assert.equal(await page.getByText(/STALE_COMPLETION|STALE_ERROR/).count(), 0);
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  console.log(
    "PASS uncooperative cancellation detaches and stale completions cannot affect a new task",
  );
  // Instruction changes prepare a replacement session without hiding model selection.
  await page.getByRole("button", { name: "输入框操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "Bot 设置", exact: true }).click();
  await page
    .getByRole("textbox", { name: "长期指令", exact: true })
    .fill("Keep responses concise.");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id)?.catalog
        ?.models?.length > 1,
    id,
  );
  await openRuntime();
  assert.equal(
    await page
      .getByRole("listbox", { name: "模型", exact: true, includeHidden: true })
      .getByRole("option", { includeHidden: true })
      .count(),
    2,
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  console.log("PASS edited instructions reprepare models before sending");
  await send("#stream-test");
  await new Promise((r) => setTimeout(r, 1700));
  await page.locator(".conversation-history").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("PageUp");
  await page.locator(".conversation-history").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole("button", { name: "回到最新", exact: true }).waitFor();
  const chatCount = await page.locator(".message.assistant").count();
  const scrollAt = await page
    .locator(".conversation-history")
    .evaluate((el) => el.scrollTop);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(
    await page.locator(".conversation-history").evaluate((el) => el.scrollTop),
    scrollAt,
  );
  assert.equal(await page.locator(".message.assistant").count(), chatCount);
  assert.equal(
    await page.locator(".message .tool-trace,.message .thought").count(),
    0,
  );
  await page.getByRole("button", { name: "回到最新", exact: true }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id).status ===
      "idle",
    id,
  );
  await openRecords();
  assert(
    (await page.locator(".operation-records").innerText()).includes(
      "过程与决策",
    ),
  );
  assert.equal(
    await page
      .locator(".message")
      .getByText(/Streaming line/)
      .count(),
    0,
  );
  await page.getByRole("button", { name: "收起侧面板", exact: true }).click();
  console.log(
    "PASS internal streaming stays in records and respects reading position",
  );
  await page.getByRole("button", { name: "连接与权限", exact: true }).click();
  await page.locator("dialog").waitFor();
  await page.getByRole("radio", { name: "操作权限", exact: true }).check();
  await shot("permissions-wide");
  await page.getByRole("radio", { name: "外观", exact: true }).check();
  await page.getByRole("radio", { name: "深色", exact: true }).check();
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await resize(680, 760);
  await shot("conversation-dark-narrow");
  await openRecords();
  assert.equal(
    await page.locator(".bot-main").evaluate((el) => el.inert),
    true,
  );
  assert.equal(
    await page.locator(".task-inspector").getAttribute("aria-modal"),
    null,
  );
  assert.equal(await page.locator(".bot-main").isVisible(), false);
  assert.equal(await page.locator(".bot-sidebar").evaluate(el => el.inert), false);
  await page.keyboard.press("Tab");
  assert(
    await page
      .locator(".task-inspector")
      .evaluate((el) => el.contains(document.activeElement)),
  );
  await shot("inspector-dark-narrow");
  await page.getByRole("radio", { name: "电脑", exact: true }).check();
  await page.getByRole("radio", { name: "权限", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole('separator', { name: '调整详情侧栏宽度' }).count(), 0, 'page mode has no meaningless resize handle');
  await page.keyboard.press("Escape");
  await page.locator(".task-inspector").waitFor({state:"detached"});
  assert.equal(
    await page
      .getByRole("button", { name: "查看 Bot 详情", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  console.log("PASS narrow details replace chat, leave Bot navigation available and restore focus on Escape");
  await page.getByRole("separator", {name:"调整 Bot 侧栏宽度"}).dblclick();
  await page.getByRole("button", { name: /研究助手/ }).click();
  await wait(
    async (id) =>
      (await window.bot.snapshot()).bots.find((b) => b.id === id)?.catalog
        ?.models?.length > 1,
    other,
  );
  assert.equal(await page.locator(".message").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "回到最新", exact: true }).count(),
    0,
  );
  console.log("PASS distinct Bots have independent sessions and history");
  await openRecords();
  for (const tab of ["详情", "电脑"]) {
    await page.getByRole("radio", { name: tab, exact: true }).check();
    await page.getByRole("radio", { name: tab, exact: true }).focus();
    await page.keyboard.press("Tab");
    assert(await page.evaluate(() => !document.activeElement?.closest('.bot-main')), 'hidden chat controls are not focusable in the details page');
  }
  await page.keyboard.press("Escape");
  // Compact control labels are a product contract, not a visual guess.
  const layouts = [];
  for (const [theme, width, height, zoom] of [
    ["light", 1180, 850, 1],
    ["dark", 680, 760, 1],
    ["light", 620, 700, 1.25],
    ["dark", 620, 700, 1.5],
  ]) {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
    );
    await resize(width, height);
    await app.evaluate(
      ({ BrowserWindow }, zoom) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),
      zoom,
    );
    await page.evaluate((theme) => window.bot.configure({ theme }), theme);
    await compactLabels("conversation " + theme + " " + zoom);
    assert.equal(
      await page.getByRole("button", { name: "回到最新", exact: true }).count(),
      0,
      "empty conversation has no jump control",
    );
    await shot(`labels-${theme}-${width}-${zoom}-chat`);
    await page.getByRole("button", { name: "输入框操作", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "模型与后端", exact: true })
      .waitFor();
    await compactLabels("input menu " + theme + " " + zoom);
    await shot(`labels-${theme}-${width}-${zoom}-menu`);
    await page
      .getByRole("menuitem", { name: "模型与后端", exact: true })
      .click();
    await compactLabels("runtime " + theme + " " + zoom);
    await shot(`labels-${theme}-${width}-${zoom}-runtime`);
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await openSettings();
    for (const tab of ["连接", "操作权限", "外观"]) {
      await page.getByRole("radio", { name: tab, exact: true }).check();
      await compactLabels(tab + " " + theme + " " + zoom);
      await shot(`labels-${theme}-${width}-${zoom}-${tab}`);
    }
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    layouts.push({ theme, width, height, zoom, ...metrics });
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
    const add = page.getByRole("button", { name: "新建 Bot", exact: true });
    await add.filter({visible: true}).click();
    await compactLabels("create Bot " + theme + " " + zoom);
    await shot(`labels-${theme}-${width}-${zoom}-create`);
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  }
  writeFileSync(
    "test-results/label-layouts.json",
    JSON.stringify(layouts, null, 2),
  );
  console.log(
    "PASS compact labels stay on one line across light/dark, narrow windows and 125/150 percent zoom",
  );
  assert.deepEqual(errors, []);
  console.log("BOT_UI_PROFILE", data);
  console.log("All Bot UI and browser checks passed.");
} catch (error) {
  console.error(error.stack || error);
  await page.screenshot({ path: "test-results/failure.png" });
  console.error("BOT_UI_FAILED", data);
  console.error(
    await page
      .locator(".bot-app")
      .innerText()
      .catch(() => ""),
  );
  throw error;
} finally {
  await app.close();
  await new Promise((r) => server.close(r));
}
