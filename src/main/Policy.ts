import { randomUUID } from "node:crypto";
import type { Approval, Decision, Grant } from "../shared/model";

const TTL = 30 * 60_000;
export class Policy {
  private runs = new Map<string, string>();
  private pending = new Map<
    string,
    {
      request: Approval;
      resolve: (answer: Decision) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private grants: Grant[] = [];
  constructor(
    private changed: () => void,
    private now = () => Date.now(),
  ) {}
  begin(botId: string, runId: string) {
    this.end(botId);
    this.runs.set(botId, runId);
  }
  active(botId: string, runId?: string) {
    return this.runs.has(botId) && (!runId || this.runs.get(botId) === runId);
  }
  current(botId: string) {
    const runId = this.runs.get(botId);
    if (!runId) throw Error("任务已停止。");
    return runId;
  }
  assert(botId: string, runId: string) {
    if (!this.active(botId, runId)) throw Error("任务已停止或已被替换。");
  }
  requests() {
    return [...this.pending.values()].map((x) => x.request);
  }
  allowed() {
    return this.grants.filter((g) => g.expiresAt > this.now());
  }
  async ask(
    input: Omit<Approval, "id" | "runId">,
    expectedRun?: string,
  ): Promise<Decision> {
    const runId = this.runs.get(input.botId);
    if (!runId) throw Error("任务已停止，不能继续请求权限。");
    if (expectedRun) this.assert(input.botId, expectedRun);
    if (this.requests().filter((r) => r.botId === input.botId).length >= 8)
      throw Error("待确认请求过多，请先处理现有请求。");
    const existing =
      input.taskScope &&
      this.allowed().find(
        (g) =>
          g.botId === input.botId &&
          g.target === input.target &&
          (g.capability === input.capability ||
            (g.capability === "browser.interact" &&
              input.capability === "browser.read")),
      );
    if (existing) return { allow: true, scope: "task" };
    const request = { ...input, id: randomUUID(), runId };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(request.id)) {
          resolve({ allow: false });
          this.changed();
        }
      }, 120_000);
      timer.unref?.();
      this.pending.set(request.id, { request, resolve, timer });
      this.changed();
    });
  }
  decide(id: string, answer: Decision) {
    const p = this.pending.get(id);
    if (!p) throw Error("这条授权请求已结束。");
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (!this.active(p.request.botId, p.request.runId)) {
      p.resolve({ allow: false });
      this.changed();
      return;
    }
    if (answer.allow && answer.scope === "task" && p.request.taskScope)
      this.grants.push({
        id: randomUUID(),
        botId: p.request.botId,
        capability: p.request.capability,
        target: p.request.target,
        expiresAt: this.now() + TTL,
      });
    p.resolve(answer);
    this.changed();
  }
  async require(
    input: Omit<Approval, "id" | "runId">,
    runId = this.current(input.botId),
  ) {
    const answer = await this.ask(input, runId);
    if (!answer.allow) throw Error("操作未获授权。");
    this.assert(input.botId, runId);
  }
  revoke(botId: string) {
    this.grants = this.grants.filter((g) => g.botId !== botId);
    this.changed();
  }
  end(botId: string) {
    this.runs.delete(botId);
    this.grants = this.grants.filter((g) => g.botId !== botId);
    for (const [id, p] of this.pending)
      if (p.request.botId === botId) {
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.resolve({ allow: false });
      }
    this.changed();
  }
}
