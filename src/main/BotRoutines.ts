import { nextRun } from "@fenn-main/core/schedule";
import { parseScheduleArgs } from "@fenn-main/core/scheduleInput";
import type { BotRoutine, Schedule } from "../shared/model";

export function checkedSchedule(schedule: Schedule, enabled: boolean): Schedule {
  if (!schedule || typeof schedule !== "object") throw Error("请选择运行时间。");
  switch (schedule.kind) {
    case "once":
      if (!Number.isFinite(schedule.at)) throw Error("运行时间无效。");
      return parseScheduleArgs({ schedule: "once", at: new Date(schedule.at).toISOString() }, enabled ? Date.now() : 0);
    case "interval": return parseScheduleArgs({ schedule: "interval", minutes: schedule.minutes });
    case "daily": return parseScheduleArgs({ schedule: schedule.weekdays?.length ? "weekly" : "daily", time: schedule.time, weekdays: schedule.weekdays });
    case "cron": return parseScheduleArgs({ schedule: "cron", cron: schedule.expr });
    default: throw Error("不支持的运行时间。");
  }
}

/** Local lifecycle over the shared Fenn schedule engine. Never overlaps a Bot's existing task. */
export class BotRoutines {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private running = new Set<string>();
  constructor(private readonly host: {
    list: () => BotRoutine[];
    busy: (botId: string) => boolean;
    send: (botId: string, text: string) => Promise<void>;
    changed: () => void;
  }) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const loop = () => {
      if (this.stopped) return;
      void this.tick();
      const now = Date.now(), due = this.host.list().filter((routine) => routine.enabled && routine.nextRunAt !== undefined).map((routine) => routine.nextRunAt! - now);
      const delay = Math.max(500, Math.min(20_000, ...due.map((delay) => delay <= 0 ? 1000 : delay + 50)));
      this.timer = setTimeout(loop, delay);
      this.timer.unref?.();
    };
    loop();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  async tick(now = Date.now()) {
    await Promise.all(this.host.list().filter((routine) => routine.enabled && routine.nextRunAt !== undefined && routine.nextRunAt <= now).map((routine) => this.run(routine.id, false, now)));
  }
  async run(id: string, manual = true, now = Date.now()) {
    const routine = this.host.list().find((entry) => entry.id === id);
    if (!routine || this.running.has(id)) return;
    if (this.host.busy(routine.botId)) {
      if (manual) throw Error("这个 Bot 仍在工作，结束后再运行。");
      return;
    }
    this.running.add(id);
    const slot = routine.nextRunAt;
    let failure: string | undefined;
    try { await this.host.send(routine.botId, `【定期任务 · ${routine.name}】\n${routine.prompt}`); }
    catch (error) { failure = error instanceof Error ? error.message : String(error); }
    finally {
      this.running.delete(id);
      const fresh = this.host.list().find((entry) => entry.id === id);
      if (fresh) {
        fresh.lastRunAt = now;
        fresh.lastError = failure;
        const early = manual && slot !== undefined && slot > now;
        if (fresh === routine && !early) {
          if (fresh.schedule.kind === "once") fresh.enabled = false;
          fresh.nextRunAt = fresh.enabled ? nextRun(fresh.schedule, Math.max(now, Date.now()), now, slot) : undefined;
        }
        this.host.changed();
      }
    }
  }
}
