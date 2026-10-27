import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Choice { value: string; label: string; icon?: ReactNode }

/** One styled selector for every backend. The native popover stays above modal dialogs. */
export function SelectControl({ label, value, options, disabled, autoFocus, onChange }: {
  label: string;
  value?: string;
  options: Choice[];
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const typeahead = useRef({ text: "", at: 0 });
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const place = () => {
    const anchor = trigger.current, popup = list.current;
    if (!anchor || !popup) return;
    const rect = anchor.getBoundingClientRect(), below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
    const height = Math.min(288, Math.max(below, above));
    popup.style.width = `${Math.min(Math.max(rect.width, 180), window.innerWidth - 24)}px`;
    popup.style.maxHeight = `${height}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 12))}px`;
    popup.style.top = `${below >= Math.min(288, popup.scrollHeight) || below >= above ? rect.bottom + 5 : Math.max(12, rect.top - popup.offsetHeight - 5)}px`;
  };
  const reveal = (index = selected) => {
    if (disabled || !options.length) return;
    setActive(index);
    list.current?.showPopover();
    setOpen(true);
    place();
  };
  const hide = () => { list.current?.hidePopover(); setOpen(false); };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    hide();
    trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    const popup = list.current;
    if (!popup) return;
    const toggle = () => setOpen(popup.matches(":popover-open"));
    popup.addEventListener("toggle", toggle);
    return () => popup.removeEventListener("toggle", toggle);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    if (disabled) { hide(); return; }
    const reposition = () => place();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const observer = new ResizeObserver(reposition);
    if (trigger.current) observer.observe(trigger.current);
    place();
    // A dialog's transform changes the anchor without a resize/scroll event.
    // Follow that movement while the list is open, as the shared Code menu does.
    let last = trigger.current?.getBoundingClientRect();
    let frame = requestAnimationFrame(function followAnchor() {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect && last && (rect.left !== last.left || rect.top !== last.top)) place();
      last = rect;
      frame = requestAnimationFrame(followAnchor);
    });
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [open, disabled, options.length]);
  useLayoutEffect(() => {
    if (!open) return;
    const popup = list.current, row = popup?.children[active] as HTMLElement | undefined;
    if (popup && row) {
      if (row.offsetTop < popup.scrollTop) popup.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > popup.scrollTop + popup.clientHeight)
        popup.scrollTop = row.offsetTop + row.offsetHeight - popup.clientHeight;
    }
  }, [active, open]);
  return <div className="select-control">
    <button type="button" ref={trigger} className="select-trigger" role="combobox"
      data-autofocus={autoFocus || undefined} aria-label={label} aria-haspopup="listbox"
      aria-controls={id} aria-expanded={open} aria-activedescendant={open ? `${id}-${active}` : undefined}
      disabled={disabled || !options.length}
      onClick={() => list.current?.matches(':popover-open') ? hide() : reveal()}
      onKeyDown={(event) => {
        // Native toggle events are coalesced. Fast key sequences must use the
        // actual top-layer state rather than waiting for that deferred event.
        const isOpen = !!list.current?.matches(':popover-open');
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : !isOpen ? selected : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
          if (!isOpen) reveal(next); else setActive(next);
        } else if ((event.key === "Enter" || event.key === " ") && isOpen) {
          event.preventDefault(); choose(active);
        } else if (event.key === "Escape" && isOpen) {
          event.preventDefault(); event.stopPropagation(); hide();
        } else if (event.key === "Tab") hide();
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
          event.preventDefault();
          const now = Date.now();
          typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : "") + event.key.toLowerCase(), at: now };
          const index = options.findIndex((option) => option.label.toLowerCase().startsWith(typeahead.current.text));
          if (index >= 0) { if (isOpen) setActive(index); else reveal(index); }
        }
      }}>
      {options.find(option=>option.value===value)?.icon}<span>{options.find((option) => option.value === value)?.label || (value ? "后端默认" : options[selected]?.label) || "暂不可选"}</span><ChevronDown size={15} />
    </button>
    <div ref={list} id={id} popover="auto" role="listbox" aria-label={label} className="select-list">
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={option.value === value} className={index === active ? "active" : ""}
        title={option.label} onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(index); }}>{option.icon}<span>{option.label}</span>{option.value === value && <Check size={14} />}</div>)}
    </div>
  </div>;
}
