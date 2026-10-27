import { useEffect, useRef, useState, type CSSProperties } from 'react';

const NAV = { key: 'bot:sidebar-width', min: 72, max: 320, initial: 80 };
const DETAILS = { key: 'bot:inspector-width', min: 300, max: 560, initial: 340 };
const MAIN_MIN = 380;
// A named tile is 96px wide, with 16px sidebar padding on either side.
const NAMED_NAV_MIN = 96 + 16 * 2;
const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function read(config: typeof NAV) {
  const stored = Number(localStorage.getItem(config.key));
  return Number.isFinite(stored) && stored >= config.min ? stored : config.initial;
}
function Grip({ label, className, edge, width, min, max, initial, change, reset }: {
  label: string; className: string; edge: 'left' | 'right'; width: number; min: number; max: number; initial: number; change: (value: number) => void;
  reset?: () => void;
}) {
  const start = useRef({ x: 0, width: 0 });
  return <div className={`pane-resize ${className}`} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); const parent = event.currentTarget.parentElement, css = parent && getComputedStyle(parent); const actual = bounded(parent ? parent.getBoundingClientRect().width + parseFloat(css!.marginLeft || '0') + parseFloat(css!.marginRight || '0') : width, min, max); start.current = { x: event.clientX, width: actual }; change(actual); event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.resizing = 'true'; }}
    onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) change(bounded(start.current.width + (event.clientX - start.current.x) * (edge === 'left' ? -1 : 1), min, max)); }}
    onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); delete event.currentTarget.dataset.resizing; }}
    onLostPointerCapture={event => { delete event.currentTarget.dataset.resizing; }}
    onDoubleClick={() => reset ? reset() : change(bounded(initial, min, max))}
    onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); change(bounded(event.key === 'Home' ? min : event.key === 'End' ? max : width + (event.key === 'ArrowRight' ? 12 : -12) * (edge === 'left' ? -1 : 1), min, max)); }} />;
}

/** Both panes use the same drag contract and preserve the user's preferred size. */
export function useWorkspaceResize(inspecting: boolean) {
  const [nav, setNav] = useState(() => localStorage.getItem('bot:rail-layout') === '1' ? read(NAV) : NAV.initial), [details, setDetails] = useState(() => read(DETAILS));
  const [viewport, setViewport] = useState(() => window.innerWidth);
  useEffect(() => { const resize = () => setViewport(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const navMax = Math.max(NAV.min, Math.min(NAV.max, viewport - MAIN_MIN));
  const navWidth = viewport < 700 ? NAV.initial : bounded(nav, NAV.min, navMax);
  const canDock = viewport >= navWidth + DETAILS.min + MAIN_MIN + 24;
  const integrated = inspecting && canDock;
  const detailMax = Math.max(DETAILS.min, Math.min(DETAILS.max, integrated ? viewport - navWidth - MAIN_MIN - 24 : viewport - navWidth - 24));
  const detailWidth = bounded(details, DETAILS.min, detailMax);
  useEffect(() => { localStorage.setItem('bot:rail-layout', '1'); }, []);
  const remember = (key: string, set: (width: number) => void) => (value: number) => { const width = Math.round(value); set(width); localStorage.setItem(key, String(width)); };
  const toggleNav = () => { const width = navWidth < NAMED_NAV_MIN ? 276 : NAV.initial; setNav(width); localStorage.setItem(NAV.key, String(width)); };
  return {
    viewport, canDock, detailWidth, rail: navWidth < NAMED_NAV_MIN,
    toggleNav,
    style: { '--sidebar-width': `${navWidth}px`, '--inspector-width': `${detailWidth}px` } as CSSProperties,
    leftHandle: <Grip label="调整 Bot 侧栏宽度" className="sidebar-resize" edge="right" width={navWidth} min={NAV.min} max={navMax} initial={NAV.initial} reset={toggleNav} change={remember(NAV.key, setNav)} />,
    rightHandle: <Grip label="调整详情侧栏宽度" className="inspector-resize" edge="left" width={detailWidth} min={DETAILS.min} max={detailMax} initial={DETAILS.initial} change={remember(DETAILS.key, setDetails)} />,
  };
}
