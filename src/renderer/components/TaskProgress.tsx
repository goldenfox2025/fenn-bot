import { useLayoutEffect, useRef } from "react";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "../../shared/model";

export function TaskProgress({
  bot,
  blocked,
  onInspect,
}: {
  bot: Bot;
  blocked: boolean;
  onInspect: () => void;
}) {
  const owned = useRef(false),
    busy = ["running", "waiting", "stopping"].includes(bot.status);
  useLayoutEffect(
    () => () => {
      if (owned.current)
        requestAnimationFrame(() => {
          if (
            document.activeElement !== document.body &&
            document.activeElement?.isConnected
          )
            return;
          owned.current = false;
          (
            document.querySelector<HTMLElement>(
              ".approval-card button:not(:disabled)",
            ) || document.querySelector<HTMLElement>(".bot-composer textarea")
          )?.focus({ preventScroll: true });
        });
    },
    [busy, blocked],
  );
  if (!busy || blocked) return null;
  const label =
    bot.status === "stopping"
      ? "正在停止…"
      : bot.status === 'waiting' ? '等待继续' : bot.messages.findLast(message => message.channel === 'activity')?.blocks.some(block => block.kind === 'tool' && ['pending','running','in_progress'].includes(block.status)) ? '正在处理' : '正在思考';
  return (
    <button
      type="button"
      className="task-progress"
      aria-label="查看操作记录"
      title="查看操作记录"
      onClick={onInspect}
      onFocus={() => {
        owned.current = true;
      }}
      onBlur={(event) => {
        if (event.relatedTarget) owned.current = false;
      }}
    >
      <BotAvatar bot={bot} size={26} animated />
      <span className="task-progress-label" role="status">
        {label}
      </span>
      <span className="progress-dots" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}
