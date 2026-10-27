import { app, BrowserWindow, ipcMain, globalShortcut, shell } from "electron";
import { join, resolve } from "node:path";
import { BotCore } from "./Core";
import { nativeComputer } from "./NativeComputer";
import { webUrl } from "./Browser";
import type { Snapshot } from "../shared/model";

app.setName("Fenn Bot");
const data =
  process.env.FENN_BOT_DATA || join(app.getPath("appData"), "Fenn Bot", "data");
if (process.env.FENN_BOT_DATA)
  app.setPath("userData", join(data, "electron-profile"));
let window: BrowserWindow | undefined,
  bar: BrowserWindow | undefined,
  core: BotCore | undefined,
  disposing = false;
const controlled = new Set<string>();
const stopAll = () => {
  for (const bot of core?.state.bots || []) void core!.stop(bot.id);
  for (const group of core?.state.groups || []) void core!.stopGroup(group.id);
};
function active(id: string, on: boolean) {
  if (on) controlled.add(id);
  else controlled.delete(id);
  if (controlled.size) {
    if (!bar) {
      bar = new BrowserWindow({
        width: 370,
        height: 48,
        alwaysOnTop: true,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        focusable: false,
        show: false,
        webPreferences: { sandbox: true },
      });
      bar.webContents.on("will-navigate", (e, url) => {
        e.preventDefault();
        if (url === "fenn-stop://now") stopAll();
      });
      void bar.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#242422;color:#faf9f5;font:14px system-ui;display:flex;align-items:center;gap:16px;padding:10px 14px}span{flex:1}button{background:#fff;color:#141413;border:0;border-radius:6px;padding:6px 14px;font:inherit}</style><span>Fenn Bot 正在操作 · Ctrl Shift Esc 停止</span><button onclick="location.href=\'fenn-stop://now\'">停止</button>',
          ),
      );
    }
    window?.minimize();
    bar.showInactive();
  } else {
    bar?.hide();
  }
}
void app
  .whenReady()
  .then(async () => {
    app.setAppUserModelId("local.fenn.bot");
    const resources = resolve(__dirname, "../../resources/fenn");
    core = new BotCore(data, resources, (state: Snapshot) => {
      if (!window || window.isDestroyed()) return;
      window.webContents.send("bot:state", state);
      if (
        state.approvals.some((p) => p.capability === "desktop") &&
        window.isMinimized()
      ) {
        window.restore();
        window.show();
      }
    });
    const native = nativeComputer(
      resources,
      () => core!.state.config,
      (id, request) => core!.requestComputer(id, request),
      active,
      () => core!.assertExecution(),
    );
    core.setComputer(native.control);
    await core.start();
    const methods = [
      "browserInfo", "browserFrame", "stopBrowser",
      "snapshot",
      "createBot",
      "onboardBot",
      "updateBot",
      "deleteBot",
      "createGroup", "updateGroup", "sendGroup", "stopGroup",
      "send",
      "stop",
      "prepare",
      "decide",
      "revoke",
      "configure",
      "addBackend",
      "listMemory",
      "listMemorySkills",
      "composeMemory",
      "saveMemory",
      "deleteMemory",
      "saveRoutine",
      "deleteRoutine",
      "runRoutine",
    ] as const;
    for (const name of methods)
      ipcMain.handle(`bot:${name}`, (_, ...args) =>
        (core![name] as (...args: unknown[]) => unknown).apply(core, args),
      );
    ipcMain.handle("bot:openLink", (_, url: string) =>
      shell.openExternal(webUrl(url).href),
    );
    window = new BrowserWindow({
      width: 1040,
      height: 763,
      minWidth: 620,
      minHeight: 540,
      title: "Fenn Bot",
      icon: resolve(__dirname, "../../resources/bot-icon.png"),
      show: false,
      backgroundColor:
        core.state.config.theme === "dark" ? "#181818" : "#fcfcfc",
      titleBarStyle: "hidden",
      titleBarOverlay: false,
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        backgroundThrottling: process.env.FENN_BOT_TEST !== "1",
        // Hidden Windows surfaces throttle rAF even with timer throttling off.
        // Isolated UI checks use offscreen painting, like Fenn Code's harness.
        offscreen: process.env.FENN_BOT_TEST === '1' && process.env.FENN_BOT_BACKGROUND === '1',
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    ipcMain.on('bot:window', (_event, action: unknown) => {
      if (!window || window.isDestroyed()) return;
      if (action === 'minimize') window.minimize();
      else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
      else if (action === 'close') window.close();
    });
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    if (process.env.ELECTRON_RENDERER_URL)
      await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    else await window.loadFile(join(__dirname, "../renderer/index.html"));
    if (process.env.FENN_BOT_BACKGROUND !== "1") {
      if (process.env.FENN_SHOW_INACTIVE === '1') window.showInactive();
      else window.show();
    }
    globalShortcut.register("CommandOrControl+Shift+Escape", stopAll);
    app.on("activate", () => {
      window?.restore();
      window?.show();
    });
    window.on("closed", () => app.quit());
    app.on("before-quit", (event) => {
      if (disposing) return;
      event.preventDefault();
      disposing = true;
      void core!.dispose().finally(() => {
        native.dispose();
        globalShortcut.unregisterAll();
        bar?.destroy();
        app.quit();
      });
    });
  })
  .catch((error) => {
    console.error("Fenn Bot startup failed:", error);
    app.exit(1);
  });
