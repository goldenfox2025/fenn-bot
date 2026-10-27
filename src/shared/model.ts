import type { BackendSummary, SessionInfo } from "@fenn-shared/contract";
import type { MemoryEntry, Schedule } from "@fenn-shared/model";
export type { MemoryEntry, Schedule } from "@fenn-shared/model";

export type Block =
  | { kind: "text" | "thought"; text: string; at?: number }
  | {
      kind: "tool";
      id: string;
      title: string;
      status: string;
      detail?: string;
      redacted?: boolean;
      at?: number;
      duration?: number;
      hostBound?: boolean;
    };
export interface Message {
  id: string;
  role: "user" | "assistant";
  /** Reserved for named senders and future message channels; missing means the local user. */
  senderName?: string;
  senderBotId?: string;
  senderAvatar?: AvatarKind;
  senderColor?: string;
  blocks: Block[];
  at: number;
  interrupted?: boolean;
  channel?: "chat" | "activity";
  runId?: string;
  turnStatus?: "running" | "done" | "cancelled" | "error";
  deliveryKey?: string;
}
export interface Bot {
  id: string;
  name: string;
  avatar?: AvatarKind;
  /** Optional six-digit hex avatar color; validated at the main-process boundary. */
  color?: string;
  parentId?: string;
  /** Internal room participant: independent ACP session, never a private-DM replay. */
  identityId?: string;
  roomId?: string;
  instructions: string;
  backendId: string;
  modelId?: string;
  optionValues?: Record<string, string>;
  backendPreferences?: Record<string, { modelId?: string; optionValues?: Record<string, string> }>;
  status: "idle" | "connecting" | "running" | "waiting" | "stopping" | "error";
  error?: string;
  messages: Message[];
  catalog?: SessionInfo;
}
export interface Config {
  browserMode: "auto" | "isolated" | "existing";
  cdpUrl: string;
  computerEnabled: boolean;
  theme: "light" | "dark";
}
export interface AppChoice {
  key: string;
  name: string;
  tier: "view" | "click" | "full" | "none";
  running: boolean;
}
export interface Approval {
  id: string;
  botId: string;
  runId: string;
  capability: string;
  title: string;
  target: string;
  detail?: string;
  taskScope: boolean;
  apps?: AppChoice[];
  choices?: { id: string; label: string; kind: string }[];
}
export interface Decision {
  allow: boolean;
  scope?: "once" | "task";
  optionId?: string;
  apps?: Record<string, "view" | "click" | "full" | "none">;
}
export interface Grant {
  id: string;
  botId: string;
  capability: string;
  target: string;
  expiresAt: number;
}
export interface DesktopGrant {
  botId: string;
  key: string;
  name: string;
  tier: "view" | "click" | "full";
}
export interface Activity {
  id: string;
  botId: string;
  title: string;
  target?: string;
  status: "running" | "done" | "error";
  at: number;
  duration?: number;
  detail?: string;
}
export interface Preview {
  botId: string;
  url: string;
  title: string;
  image?: string;
}
export interface Snapshot {
  bots: Bot[];
  groups: GroupChat[];
  backends: BackendSummary[];
  config: Config;
  approvals: Approval[];
  grants: Grant[];
  desktopGrants: DesktopGrant[];
  activities: Activity[];
  previews: Preview[];
  memoryVersion?: Record<string, number>;
  routines?: BotRoutine[];
}
export interface BotRoutine {
  id: string;
  botId: string;
  name: string;
  prompt: string;
  schedule: Schedule;
  enabled: boolean;
  nextRunAt?: number;
  lastRunAt?: number;
  lastError?: string;
}
export type RoutineInput = Pick<BotRoutine, "name" | "prompt" | "schedule"> & { id?: string; enabled?: boolean };
export interface BotApi {
  windowControl(action: 'minimize' | 'maximize' | 'close'): void;
  browserInfo(id: string): Promise<BrowserInfo | null>;
  browserFrame(id: string): Promise<BrowserFrame | null>;
  stopBrowser(id: string): Promise<void>;
  platform: string;
  snapshot(): Promise<Snapshot>;
  subscribe(callback: (state: Snapshot) => void): () => void;
  createBot(
    name: string,
    backendId: string,
    instructions?: string,
    parentId?: string,
    avatar?: AvatarKind,
    color?: string,
  ): Promise<Bot>;
  onboardBot(id: string): Promise<void>;
  updateBot(
    id: string,
    patch: Partial<
      Pick<
        Bot,
        "name" | "backendId" | "instructions" | "modelId" | "optionValues" | "avatar" | "color"
      >
    >,
  ): Promise<void>;
  deleteBot(id: string): Promise<void>;
  createGroup(name: string, memberIds: string[]): Promise<GroupChat>;
  updateGroup(id: string, patch: { name?: string; memberIds?: string[] }): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  sendGroup(id: string, text: string): Promise<void>;
  stopGroup(id: string): Promise<void>;
  send(id: string, text: string): Promise<void>;
  stop(id: string): Promise<void>;
  prepare(id: string): Promise<void>;
  decide(id: string, decision: Decision): Promise<void>;
  revoke(botId: string): Promise<void>;
  configure(patch: Partial<Config>): Promise<void>;
  addBackend(name: string, command: string, args: string[]): Promise<void>;
  openLink(url: string): Promise<void>;
  listMemory(botId: string): Promise<MemoryEntry[]>;
  listMemorySkills(botId: string): Promise<MemorySkill[]>;
  composeMemory(botId: string, input: MemoryInput): Promise<MemoryDraft>;
  saveMemory(botId: string, entry: { name: string; description: string; type?: string; body: string }): Promise<MemoryEntry>;
  deleteMemory(botId: string, name: string): Promise<void>;
  saveRoutine(botId: string, input: RoutineInput): Promise<BotRoutine>;
  deleteRoutine(botId: string, routineId: string): Promise<void>;
  runRoutine(botId: string, routineId: string): Promise<void>;
}
declare global {
  interface Window {
    bot: BotApi;
  }
}
import type { MemoryInput, MemoryDraft, MemorySkill } from '@fenn-shared/memoryInput';
import type { BrowserInfo, BrowserFrame } from '@fenn-shared/browser';
export type AvatarKind = 'fox' | 'owl' | 'cat' | 'bear' | 'robot' | 'rabbit' | 'penguin' | 'raccoon' | 'initials';
export interface GroupChat { id: string; name: string; hostId: string; memberIds: string[]; actors: Bot[]; messages: Message[]; createdAt: number }
