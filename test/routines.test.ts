import { describe, expect, it, vi } from "vitest";
import { BotRoutines, checkedSchedule } from "../src/main/BotRoutines";
import type { BotRoutine } from "../src/shared/model";

const routine = (patch: Partial<BotRoutine> = {}): BotRoutine => ({ id: "daily", botId: "one", name: "Check", prompt: "Inspect", schedule: { kind: "interval", minutes: 5 }, enabled: true, nextRunAt: 1000, ...patch });
describe("per-Bot scheduled work", () => {
  it("defers busy Bots, runs once and schedules past missed slots", async () => {
    const item = routine(), send = vi.fn(async () => {}), changed = vi.fn();
    let busy = true;
    const scheduler = new BotRoutines({ list: () => [item], busy: () => busy, send, changed });
    await scheduler.tick(1000);
    expect(send).not.toHaveBeenCalled();
    expect(item.nextRunAt).toBe(1000);
    busy = false;
    await scheduler.tick(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(item.nextRunAt).toBeGreaterThan(Date.now());
    await scheduler.tick(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not duplicate in-flight runs or resurrect deleted tasks", async () => {
    let finish!: () => void;
    let items = [routine()];
    const send = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const scheduler = new BotRoutines({ list: () => items, busy: () => false, send, changed: () => {} });
    const first = scheduler.tick(1000);
    await scheduler.tick(1000);
    expect(send).toHaveBeenCalledTimes(1);
    items = [];
    finish(); await first;
    expect(items).toEqual([]);
  });
  it("records failures, completes one-offs and preserves early manual schedule slots", async () => {
    const item = routine({ schedule: { kind: "once", at: 1000 } });
    const scheduler = new BotRoutines({ list: () => [item], busy: () => false, send: async () => { throw Error("Backend unavailable"); }, changed: () => {} });
    await scheduler.tick(1000);
    expect(item.enabled).toBe(false);
    expect(item.nextRunAt).toBeUndefined();
    expect(item.lastError).toBe("Backend unavailable");
    const early = routine({ nextRunAt: Date.now() + 60000 });
    const slot = early.nextRunAt;
    const manual = new BotRoutines({ list: () => [early], busy: () => false, send: async () => {}, changed: () => {} });
    await manual.run(early.id);
    expect(early.nextRunAt).toBe(slot);
  });
  it("uses the shared schedule validation", () => {
    expect(() => checkedSchedule({ kind: "daily", time: "25:00" }, true)).toThrow();
    expect(() => checkedSchedule({ kind: "interval", minutes: 0 }, true)).toThrow();
    expect(() => checkedSchedule({ kind: "once", at: NaN }, true)).toThrow();
    expect(checkedSchedule({ kind: "daily", time: "9:00", weekdays: [1, 1, 5] }, true)).toEqual({ kind: "daily", time: "09:00", weekdays: [1, 5] });
  });
});
