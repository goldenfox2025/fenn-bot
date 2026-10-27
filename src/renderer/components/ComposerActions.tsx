import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  Plus,
  SlidersHorizontal,
  History,
  ShieldCheck,
  Settings2,
} from "lucide-react";

export function ComposerActions({
  onRuntime,
  onActivity,
  onSettings,
  onBot,
  description,
}: {
  onRuntime: () => void;
  onActivity: () => void;
  onSettings: () => void;
  onBot: () => void;
  description: string;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    [open, setOpen] = useState(false);
  const place = () => {
    const el = menu.current,
      button = trigger.current;
    if (!el || !button) return;
    const r = button.getBoundingClientRect();
    el.style.left =
      Math.max(
        12,
        Math.min(r.left, innerWidth - (el.offsetWidth || 232) - 12),
      ) + "px";
    el.style.bottom = Math.max(12, innerHeight - r.top + 8) + "px";
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  const toggle = () => {
    const el = menu.current;
    if (!el) return;
    if (el.matches(":popover-open")) {
      el.hidePopover();
      setOpen(false);
    } else {
      place();
      el.showPopover();
      place();
      setOpen(true);
      el.querySelector<HTMLButtonElement>("button")?.focus({
        preventScroll: true,
      });
    }
  };
  const choose = (action: () => void) => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
    action();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="input-action"
        aria-label="输入框操作"
        title={description}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        <Plus size={20} />
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        className="input-menu"
        role="menu"
        aria-label="输入框操作"
        onToggle={(event) => {
          const shown = event.currentTarget.matches(":popover-open");
          setOpen(shown);
          if (!shown)
            requestAnimationFrame(() => {
              if (menu.current?.matches(":popover-open")) return;
              if (
                document.activeElement === document.body ||
                menu.current?.contains(document.activeElement)
              )
                trigger.current?.focus({ preventScroll: true });
            });
        }}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button",
              ),
            ],
            index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length
          ]?.focus();
        }}
      >
        <button type="button" role="menuitem" onClick={() => choose(onRuntime)}>
          <SlidersHorizontal size={16} />
          <span>模型与后端</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => choose(onActivity)}
        >
          <History size={16} />
          <span>操作记录</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => choose(onSettings)}
        >
          <ShieldCheck size={16} />
          <span>连接与权限</span>
        </button>
        <div className="menu-separator" />
        <button type="button" role="menuitem" onClick={() => choose(onBot)}>
          <Settings2 size={16} />
          <span>Bot 设置</span>
        </button>
      </div>
    </>
  );
}
