import { describe, it, expect } from "vitest";
import { Policy } from "../src/main/Policy";
import { webUrl, localCdp, sensitiveField } from "../src/main/Browser";
const request = (
  botId = "a",
  capability = "browser.read",
  target = "https://example.com",
) => ({
  botId,
  capability,
  target,
  title: "Read website",
  taskScope: capability !== "browser.sensitive",
});
describe("host permissions", () => {
  it("starts closed and rejects requests outside an active task", async () => {
    const p = new Policy(() => {});
    await expect(p.ask(request())).rejects.toThrow("停止");
  });
  it("once never becomes a task grant", async () => {
    const p = new Policy(() => {});
    p.begin("a", "1");
    const answer = p.ask(request());
    p.decide(p.requests()[0].id, { allow: true, scope: "once" });
    expect((await answer).allow).toBe(true);
    expect(p.allowed()).toHaveLength(0);
    p.end("a");
  });
  it("grants are isolated by Bot, origin and capability", async () => {
    const p = new Policy(() => {});
    p.begin("a", "1");
    p.begin("b", "2");
    const answer = p.ask(request("a", "browser.interact"));
    p.decide(p.requests()[0].id, { allow: true, scope: "task" });
    await answer;
    expect(await p.ask(request())).toMatchObject({ allow: true });
    expect(p.requests()).toHaveLength(0);
    const others = [
      p.ask(request("b")),
      p.ask(request("a", "browser.read", "https://other.example")),
      p.ask(request("a", "browser.sensitive")),
    ];
    expect(p.requests()).toHaveLength(3);
    for (const r of p.requests()) p.decide(r.id, { allow: false });
    expect((await Promise.all(others)).every((a) => !a.allow)).toBe(true);
    p.end("a");
    p.end("b");
  });
  it("sensitive actions cannot be remembered, and Stop settles every pending request", async () => {
    const p = new Policy(() => {});
    p.begin("a", "1");
    const answer = p.ask(request("a", "browser.sensitive"));
    p.decide(p.requests()[0].id, { allow: true, scope: "task" });
    await answer;
    expect(p.allowed()).toHaveLength(0);
    const pending = p.ask(request());
    p.end("a");
    expect(await pending).toEqual({ allow: false });
    expect(p.requests()).toHaveLength(0);
    expect(p.allowed()).toHaveLength(0);
    await expect(p.ask(request())).rejects.toThrow();
  });
  it("expiry and a new turn require fresh approval", async () => {
    let now = 100;
    const p = new Policy(
      () => {},
      () => now,
    );
    p.begin("a", "1");
    const answer = p.ask(request());
    p.decide(p.requests()[0].id, { allow: true, scope: "task" });
    await answer;
    now += 31 * 60_000;
    expect(p.allowed()).toHaveLength(0);
    const pending = p.ask(request());
    expect(p.requests()).toHaveLength(1);
    p.begin("a", "2");
    expect(await pending).toEqual({ allow: false });
    expect(p.allowed()).toHaveLength(0);
    p.end("a");
  });
  it("rejects duplicate and stale decisions", async () => {
    const p = new Policy(() => {});
    p.begin("a", "1");
    const pending = p.ask(request());
    const id = p.requests()[0].id;
    p.end("a");
    await pending;
    expect(() => p.decide(id, { allow: true })).toThrow();
  });
  it("an approved old continuation cannot borrow the replacement task", async () => {
    const p = new Policy(() => {});
    p.begin("a", "run-1");
    const pending = p.require(request());
    p.decide(p.requests()[0].id, { allow: true, scope: "task" });
    p.end("a");
    p.begin("a", "run-2");
    await expect(pending).rejects.toThrow("替换");
    expect(p.allowed()).toHaveLength(0);
    p.end("a");
  });
  it("rejects an old operation before it can request fresh approval", async () => {
    const p = new Policy(() => {});
    p.begin("a", "run-2");
    await expect(p.require(request(), "run-1")).rejects.toThrow("替换");
    expect(p.requests()).toHaveLength(0);
    p.end("a");
  });
});
describe("browser boundaries", () => {
  it("passwords, one-time codes and card fields cannot reuse ordinary fill grants", () => {
    for (const [type, autocomplete] of [
      ["password", null],
      ["text", "one-time-code"],
      ["text", "section-pay billing cc-number"],
      ["text", "cc-csc"],
      ["text", "new-password"],
    ])
      expect(sensitiveField(type, autocomplete)).toBe(true);
    expect(sensitiveField("email", "email")).toBe(false);
    expect(sensitiveField("text", null)).toBe(false);
  });
  it("only accepts web pages without embedded credentials", () => {
    expect(webUrl("https://example.com/path").origin).toBe(
      "https://example.com",
    );
    for (const raw of [
      "file:///C:/secret",
      "javascript:alert(1)",
      "http://name:secret@example.com/",
    ])
      expect(() => webUrl(raw)).toThrow();
  });
  it("CDP connections remain local", () => {
    expect(localCdp("http://127.0.0.1:9333")).toContain("127.0.0.1");
    for (const raw of [
      "https://127.0.0.1:9333",
      "http://remote.example:9333",
      "http://name:secret@localhost:9333",
    ])
      expect(() => localCdp(raw)).toThrow();
  });
});
