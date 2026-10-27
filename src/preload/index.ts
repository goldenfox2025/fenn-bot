import { contextBridge, ipcRenderer } from "electron";
import type { BotApi, Snapshot } from "../shared/model";
const names = [
  "browserInfo", "browserFrame", "stopBrowser",
  "snapshot",
  "createBot",
  "onboardBot",
  "updateBot",
  "deleteBot",
  "createGroup", "updateGroup", "deleteGroup", "sendGroup", "stopGroup",
  "send",
  "stop",
  "prepare",
  "decide",
  "revoke",
  "configure",
  "addBackend",
  "openLink",
  "listMemory",
  "listMemorySkills",
  "composeMemory",
  "saveMemory",
  "deleteMemory",
  "saveRoutine",
  "deleteRoutine",
  "runRoutine",
] as const;
const api = Object.fromEntries(
  names.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`bot:${name}`, ...args),
  ]),
) as unknown as BotApi;
api.subscribe = (callback) => {
  const listener = (_: unknown, state: Snapshot) => callback(state);
  ipcRenderer.on("bot:state", listener);
  return () => ipcRenderer.removeListener("bot:state", listener);
};
api.platform = process.platform;
api.windowControl = action => ipcRenderer.send('bot:window', action);
contextBridge.exposeInMainWorld("bot", api);
