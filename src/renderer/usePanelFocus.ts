import { useEffect, useRef } from "react";

/** Page navigation owns Back/Escape; it never traps the persistent Bot rail. */
export function usePanelFocus(
  open: boolean,
  selector: string,
  onClose: () => void,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const panel = document.querySelector<HTMLElement>(selector),
      opener = document.activeElement as HTMLElement | null;
    if (!panel) return;
    panel.querySelector<HTMLElement>('header button')?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (document.querySelector('dialog[open],[popover]:popover-open')) return;
      event.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>(".bot-composer textarea")
          ?.focus({ preventScroll: true });
    };
  }, [open, selector]);
}
