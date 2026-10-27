import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { BotCore } from "../src/main/Core";
import { basename } from 'node:path';
import type {
  SessionInfo,
  TurnResult,
  AgentEvent,
  HostEvent,
} from "@fenn-shared/contract";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
async function make() {
  const data = mkdtempSync(join(tmpdir(), "fenn-bot-core-"));
  writeFileSync(
    join(data, "backends.json"),
    JSON.stringify([
      { id: "fixture", name: "Fixture", command: process.execPath, args: [] },
    ]),
  );
  const core = new BotCore(data, join(data, "resources"), () => {});
  const bot = core.state.bots[0];
  await core.updateBot(bot.id, { backendId: "fixture" });
  vi.spyOn(core.backends, "releaseSession").mockImplementation(() => {});
  vi.spyOn(core.backends, "cancel").mockResolvedValue(undefined);
  return { core, bot };
}

describe("task recovery", () => {
  it("Stop detaches stalled opening and disposes a late obsolete session", async () => {
    const { core, bot } = await make(),
      old = deferred<SessionInfo>();
    const open = vi
      .spyOn(core.backends, "newSession")
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue({ sessionId: "replacement" });
    const first = core.prepare(bot.id);
    try {
      await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      await core.stop(bot.id);
      await core.prepare(bot.id);
      expect(bot.catalog?.sessionId).toBe("replacement");
      old.resolve({ sessionId: "obsolete" });
      await first;
      expect(core.backends.releaseSession).toHaveBeenCalledWith(
        "fixture",
        "obsolete",
      );
      expect(bot.catalog?.sessionId).toBe("replacement");
    } finally {
      old.resolve({ sessionId: "obsolete" });
      await core.dispose();
    }
  });
  it("late cancelled prompt errors cannot end or overwrite a replacement task", async () => {
    const { core, bot } = await make(),
      first = deferred<TurnResult>(),
      second = deferred<TurnResult>();
    let sessions = 0;
    vi.spyOn(core.backends, "newSession").mockImplementation(async () => ({
      sessionId: "session-" + ++sessions,
    }));
    const prompt = vi
      .spyOn(core.backends, "prompt")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const run1 = core.send(bot.id, "first");
    try {
      await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
      await core.stop(bot.id);
      const run2 = core.send(bot.id, "replacement");
      await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(2));
      first.resolve({ stopReason: "error", error: "obsolete error" });
      await run1;
      expect(bot.status).toBe("running");
      expect(bot.error).toBeUndefined();
      expect(core.policy.active(bot.id)).toBe(true);
      second.resolve({ stopReason: "end_turn" });
      await run2;
      expect(bot.status).toBe("idle");
    } finally {
      first.resolve({ stopReason: "cancelled" });
      second.resolve({ stopReason: "cancelled" });
      await core.dispose();
    }
  });
});

describe('Bot identities and group isolation', () => {
  it('assigns distinct defaults, persists choices and keeps private history out of group prompts', async () => {
    const { core, bot } = await make();
    const child = core.createBot('Research', 'fixture', 'Check evidence', bot.id);
    expect(child.avatar).not.toBe(bot.avatar);
    bot.messages.push({ id: 'secret', role: 'user', at: 1, blocks: [{ kind: 'text', text: 'PRIVATE_DM_MUST_NOT_LEAK' }] });
    await core.saveMemory(bot.id, { name: 'Private fact', description: 'Private', body: 'PRIVATE_MEMORY_MUST_NOT_LEAK' });
    const group = core.createGroup('Team', [bot.id, child.id]);
    vi.spyOn(core.backends, 'newSession').mockImplementation(async (_backend, options) => ({ sessionId: basename(options!.cwd!) }));
    const prompt = vi.spyOn(core.backends, 'prompt').mockImplementation(async (_backend, sessionId, content) => {
      const actor = group.actors.find(actor => actor.id === sessionId)!;
      const raw = JSON.stringify(content);
      expect(raw).not.toContain('PRIVATE_DM_MUST_NOT_LEAK');
      expect(raw).not.toContain('PRIVATE_MEMORY_MUST_NOT_LEAK');
      const internal = core as unknown as { deliverMessage(id: string, runId: string, args: Record<string, unknown>): unknown; running: Map<string, string> };
      internal.deliverMessage(actor.id, internal.running.get(actor.id)!, { text: 'Public result', client_id: 'reply' });
      internal.deliverMessage(actor.id, internal.running.get(actor.id)!, { text: 'Public result', client_id: 'reply' });
      return { stopReason: 'end_turn' };
    });
    try {
      await core.sendGroup(group.id, '@Research inspect it');
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(group.actors).toHaveLength(1);
      expect(group.actors[0].identityId).toBe(child.id);
      expect(group.actors[0].id).not.toBe(child.id);
      expect(child.messages).toHaveLength(0);
      expect(group.messages).toHaveLength(2);
      expect(group.messages[1].senderBotId).toBe(child.id);
      await expect(core.updateBot(child.id, { color: 'red;display:none' })).rejects.toThrow('有效的头像颜色');
      await core.updateBot(child.id, { avatar: 'rabbit', color: '#596c51' });
      expect(group.actors[0].avatar).toBe('rabbit');
      expect(group.actors[0].color).toBe('#596c51');
      await core.dispose();
      const restored = new BotCore(core.data, join(core.data, 'resources'), () => {});
      expect(restored.state.bots.find(item => item.id === child.id)).toMatchObject({avatar:'rabbit',color:'#596c51'});
      expect(restored.state.groups[0].messages).toHaveLength(2);
      await restored.dispose();
    } finally { await core.dispose(); }
  });
});

describe("explicit user-message delivery", () => {
  it("keeps memory private to its Bot, persists it and injects the latest index without a second model call", async () => {
    const { core, bot } = await make();
    const other = core.createBot("Other", "fixture");
    vi.spyOn(core.backends, "newSession").mockResolvedValue({ sessionId: "memory-session" });
    const prompt = vi.spyOn(core.backends, "prompt").mockResolvedValue({ stopReason: "end_turn" });
    try {
      await core.send(bot.id, "记住：我希望回复简短");
      expect(await core.listMemory(bot.id)).toHaveLength(1);
      expect(await core.listMemory(other.id)).toHaveLength(0);
      await core.send(bot.id, "下一个问题");
      expect(prompt).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(prompt.mock.calls[1])).toContain("我希望回复简短");
      await core.send(bot.id, "不用记住临时草稿");
      await core.send(bot.id, "记住：我的密码是 secret");
      expect(await core.listMemory(bot.id)).toHaveLength(1);
      await core.dispose();
      const restored = new BotCore(core.data, join(core.data, "resources"), () => {});
      expect(await restored.listMemory(bot.id)).toHaveLength(1);
      expect(await restored.listMemory(other.id)).toHaveLength(0);
      await restored.dispose();
    } finally { await core.dispose(); }
  });
  it("auto-approves only the host reply channel in an active owned session", async () => {
    const { core, bot } = await make(), pending = deferred<TurnResult>();
    vi.spyOn(core.backends, "newSession").mockResolvedValue({ sessionId: "owned-session" });
    const prompt = vi.spyOn(core.backends, "prompt").mockImplementation(() => pending.promise);
    const respond = vi.spyOn(core.backends, "respondPermission").mockImplementation(() => {});
    const dispatch = (requestId: string, toolName: string, sessionId = "owned-session") =>
      (core as unknown as { hostEvent: (event: HostEvent) => void }).hostEvent({ type: "permission", backendId: "fixture", request: {
        requestId, sessionId, title: "send_user_message (fenn)", toolName,
        options: [{ id: "always", label: "Always", kind: "allow_always" }, { id: "once", label: "Once", kind: "allow_once" }],
      } });
    const running = core.send(bot.id, "inspect");
    try {
      await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
      dispatch("host-message", "mcp__fenn__send_user_message");
      expect(respond).toHaveBeenCalledWith("host-message", "once");
      expect(core.policy.requests()).toHaveLength(0);
      for (const name of ["mcp__other__send_user_message", "mcp__fenn__browser_click", "send_user_message"]) {
        dispatch(name, name);
        expect(core.policy.requests()).toHaveLength(1);
        core.policy.decide(core.policy.requests()[0].id, { allow: false });
        await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(name, null));
      }
      dispatch("foreign", "mcp__fenn__send_user_message", "foreign-session");
      expect(respond).toHaveBeenCalledWith("foreign", null);
      await core.stop(bot.id);
      dispatch("stopped", "mcp__fenn__send_user_message");
      expect(respond).toHaveBeenCalledWith("stopped", null);
      pending.resolve({ stopReason: "cancelled" });
      await running;
    } finally {
      pending.resolve({ stopReason: "cancelled" });
      await core.dispose();
    }
  });
  it("settles unfinished tool records on both backend error and unconfirmed normal termination", async () => {
    for (const failed of [true, false]) {
      const { core, bot } = await make();
      vi.spyOn(core.backends, "newSession").mockResolvedValue({
        sessionId: "terminal-session",
      });
      vi.spyOn(core.backends, "prompt").mockImplementation(async () => {
        (
          core as unknown as {
            agentEvent: (id: string, event: AgentEvent) => void;
          }
        ).agentEvent(bot.id, {
          kind: "tool.start",
          toolId: "unfinished",
          title: "read_file",
          status: "running",
        });
        return failed
          ? { stopReason: "error" as const, error: "backend failed" }
          : { stopReason: "end_turn" as const };
      });
      try {
        await core.send(bot.id, "inspect");
        const journal = bot.messages.find(
          (message) => message.channel === "activity",
        );
        expect(journal?.turnStatus).toBe(failed ? "error" : "done");
        expect(
          journal?.blocks.find((block) => block.kind === "tool"),
        ).toMatchObject({ status: failed ? "failed" : "unconfirmed" });
        expect(
          bot.messages.filter(
            (message) =>
              message.role === "assistant" && message.channel !== "activity",
          ),
        ).toHaveLength(0);
      } finally {
        await core.dispose();
      }
    }
  });
  it("keeps ACP prose in records, sends messages only through the tool, and persists both channels", async () => {
    const { core, bot } = await make(),
      pending = deferred<TurnResult>();
    let endpoint = "";
    await core.start();
    vi.spyOn(core.backends, "newSession").mockImplementation(
      async (_backend, options) => {
        const server = options?.tools?.[0];
        if (server && "url" in server) endpoint = server.url;
        expect(options?.system).toContain("MUST call send_user_message");
        return { sessionId: "message-session" };
      },
    );
    const prompt = vi
      .spyOn(core.backends, "prompt")
      .mockImplementation(() => pending.promise);
    const running = core.send(bot.id, "请检查这个页面");
    const event = (event: AgentEvent) =>
      (
        core as unknown as {
          agentEvent: (id: string, event: AgentEvent) => void;
        }
      ).agentEvent(bot.id, event);
    const call = async (args: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "send_user_message", arguments: args },
        }),
      });
      return (await response.json()) as {
        result: { isError: boolean; content: { text: string }[] };
      };
    };
    try {
      await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
      event({ kind: "message.delta", text: "先读取页面结构，这是中途决策。" });
      event({ kind: "thought.delta", text: "需要核对来源。" });
      expect(
        bot.messages.filter(
          (message) =>
            message.role === "assistant" && message.channel !== "activity",
        ),
      ).toHaveLength(0);
      const first = await call({
        text: "已确认两条信息，需要你选择下一步。",
        client_id: "result-1",
      });
      expect(first.result.isError).toBe(false);
      event({ kind: "message.delta", text: "消息发送后继续记录过程。" });
      const retry = await call({
        text: "已确认两条信息，需要你选择下一步。",
        client_id: "result-1",
      });
      expect(retry.result.isError).toBe(false);
      const conflict = await call({
        text: "另一条内容",
        client_id: "result-1",
      });
      expect(conflict.result.isError).toBe(true);
      const chat = bot.messages.filter(
        (message) =>
          message.role === "assistant" && message.channel !== "activity",
      );
      expect(chat).toHaveLength(1);
      expect(chat[0].blocks).toEqual([
        { kind: "text", text: "已确认两条信息，需要你选择下一步。" },
      ]);
      expect(
        JSON.stringify(
          bot.messages.find((message) => message.channel === "activity"),
        ),
      ).toContain("消息发送后继续记录过程");
      pending.resolve({ stopReason: "end_turn" });
      await running;
      await core.dispose();
      const restored = new BotCore(
        core.data,
        join(core.data, "resources"),
        () => {},
      );
      expect(
        restored.state.bots[0].messages.filter(
          (message) => message.channel === "activity",
        ),
      ).toHaveLength(1);
      expect(
        restored.state.bots[0].messages.find(
          (message) => message.deliveryKey === "result-1",
        )?.blocks[0],
      ).toEqual({ kind: "text", text: "已确认两条信息，需要你选择下一步。" });
      await restored.dispose();
    } finally {
      pending.resolve({ stopReason: "cancelled" });
      await core.dispose();
    }
  });
  it("revokes message delivery together with the stopped task endpoint", async () => {
    const { core, bot } = await make(),
      pending = deferred<TurnResult>();
    let endpoint = "";
    await core.start();
    vi.spyOn(core.backends, "newSession").mockImplementation(
      async (_backend, options) => {
        const server = options?.tools?.[0];
        if (server && "url" in server) endpoint = server.url;
        return { sessionId: "cancel-message-session" };
      },
    );
    const prompt = vi
        .spyOn(core.backends, "prompt")
        .mockImplementation(() => pending.promise),
      running = core.send(bot.id, "wait");
    try {
      await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
      await core.stop(bot.id);
      const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "send_user_message",
            arguments: { text: "迟到的消息" },
          },
        }),
      });
      expect([404, 410]).toContain(response.status);
      expect(
        bot.messages.filter(
          (message) =>
            message.role === "assistant" && message.channel !== "activity",
        ),
      ).toHaveLength(0);
      pending.resolve({ stopReason: "cancelled" });
      await running;
    } finally {
      pending.resolve({ stopReason: "cancelled" });
      await core.dispose();
    }
  });
});
