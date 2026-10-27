import { useLayoutEffect, useRef, useState } from "react";
import { ShieldCheck, Plug, Monitor, Globe } from "lucide-react";
import type { Approval, Decision } from "../../shared/model";
import { SelectControl } from "./SelectControl";

export function ApprovalCard({
  request: r,
  more,
  onAnswer,
}: {
  request: Approval;
  more: number;
  onAnswer: (d: Decision) => Promise<void>;
}) {
  const card = useRef<HTMLElement>(null),
    ownedFocus = useRef(false);
  useLayoutEffect(() => {
    const element = card.current;
    return () => {
      if (
        ownedFocus.current &&
        (document.activeElement === document.body ||
          element?.contains(document.activeElement))
      )
        requestAnimationFrame(() => {
          if (
            document.activeElement !== document.body &&
            document.activeElement?.isConnected
          )
            return;
          const next =
            document.querySelector<HTMLElement>(
              ".approval-card button:not(:disabled)",
            ) || document.querySelector<HTMLElement>(".bot-composer textarea");
          next?.focus({ preventScroll: true });
        });
    };
  }, []);
  const [apps, setApps] = useState<
      Record<string, "view" | "click" | "full" | "none">
    >(() => Object.fromEntries((r.apps || []).map((a) => [a.key, a.tier]))),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  const send = async (d: Decision) => {
    ownedFocus.current = !!card.current?.contains(document.activeElement);
    setSent(true);
    try {
      await onAnswer({ ...d, apps });
    } catch (e) {
      setError(String((e as Error).message));
      setSent(false);
    }
  };
  return (
    <section
      ref={card}
      className="approval-card"
      aria-label="操作许可"
      aria-busy={sent}
    >
      <header role="alert">
        <ShieldCheck size={18} />
        <strong>{r.title}</strong>
        {more > 0 && <span className="muted">还有 {more} 项</span>}
      </header>
      <div className="approval-body">
        <div className="approval-target">
          {r.capability === "backend" ? (
            <Plug size={14} />
          ) : r.capability === "desktop" ? (
            <Monitor size={14} />
          ) : (
            <Globe size={14} />
          )}
          <span>{r.target}</span>
        </div>
        {r.detail && <pre>{r.detail}</pre>}
        {r.apps?.map((a) => (
          <label className="app-permission" key={a.key}>
            <span>{a.name}</span>
            <SelectControl
              label={`${a.name} 权限`}
              value={apps[a.key]}
              disabled={sent}
              onChange={(value) =>
                setApps({
                  ...apps,
                  [a.key]: value as (typeof apps)[string],
                })
              }
              options={[{ value: "none", label: "不允许" }, { value: "view", label: "仅查看" }, { value: "click", label: "仅点击" }, { value: "full", label: "点击和输入" }]}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <footer>
        <button
          className="btn"
          disabled={sent}
          onClick={() => void send({ allow: false })}
        >
          拒绝
        </button>
        <span className="spacer" />
        {r.choices ? (
          r.choices
            .filter((c) => c.kind.startsWith("allow"))
            .map((c) => (
              <button
                key={c.id}
                className="btn primary"
                title={
                  c.label + (c.kind === "allow_always" ? "（由后端保存）" : "")
                }
                disabled={sent}
                onClick={() => void send({ allow: true, optionId: c.id })}
              >
                <span className="button-label">
                  {c.label}
                  {c.kind === "allow_always" ? "（由后端保存）" : ""}
                </span>
              </button>
            ))
        ) : (
          <>
            <button
              className={"btn" + (r.capability === "desktop" ? " primary" : "")}
              disabled={sent}
              onClick={() => void send({ allow: true, scope: "once" })}
            >
              {r.capability === "desktop" ? "本轮允许" : "仅本次"}
            </button>
            {r.taskScope && (
              <button
                className="btn primary"
                disabled={sent}
                onClick={() => void send({ allow: true, scope: "task" })}
              >
                本轮允许
              </button>
            )}
          </>
        )}
      </footer>
    </section>
  );
}
