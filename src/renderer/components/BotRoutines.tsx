import { useState } from "react";
import { CalendarClock, ChevronLeft, MoreHorizontal, Plus } from "lucide-react";
import type { BotRoutine, RoutineInput, Schedule } from "../../shared/model";
import { api } from "../api";
import { SelectControl } from "./SelectControl";

const when = (time?: number) => time ? new Date(time).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
function timing(schedule: Schedule) {
  if (schedule.kind === "daily") return `${schedule.weekdays?.length ? "每周 " + schedule.weekdays.map((day) => "日一二三四五六"[day]).join("、") : "每天"} ${schedule.time}`;
  if (schedule.kind === "interval") return `每 ${schedule.minutes} 分钟`;
  if (schedule.kind === "once") return when(schedule.at);
  return `cron ${schedule.expr}`;
}
export function BotRoutines({ botId, routines }: { botId: string; routines: BotRoutine[] }) {
  const [editor, setEditor] = useState<BotRoutine | "new" | null>(null), [menu, setMenu] = useState<string | null>(null), [error, setError] = useState("");
  const act = async (work: Promise<unknown>) => { setError(""); try { await work; } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  if (editor) return <RoutineForm key={typeof editor === "string" ? editor : editor.id} botId={botId} value={typeof editor === "string" ? undefined : editor} onClose={() => setEditor(null)} />;
  return <section className="bot-routines" aria-label="定期任务">
    <div className="section-title"><h2>定期任务</h2>{!!routines.length && <button className="icon-btn" aria-label="添加定期任务" title="添加定期任务" onClick={() => setEditor("new")}><Plus size={16} /></button>}</div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {routines.length ? <div className="routine-list">{routines.map((routine) => <div className="routine-entry" key={routine.id}>
      <button className="routine-open" onClick={() => setEditor(routine)}><CalendarClock size={16} /><span><strong>{routine.name}</strong><small>{timing(routine.schedule)}{!routine.enabled ? " · 已暂停" : ""}</small>{routine.nextRunAt && <small>下次 {when(routine.nextRunAt)}</small>}{routine.lastRunAt && <small className={routine.lastError ? "routine-failed" : ""}>上次 {when(routine.lastRunAt)}{routine.lastError ? ` · ${routine.lastError}` : " · 已运行"}</small>}</span></button>
      <button className="icon-btn" aria-label={`${routine.name} 的操作`} aria-expanded={menu === routine.id} onClick={() => setMenu(menu === routine.id ? null : routine.id)}><MoreHorizontal size={16} /></button>
      {menu === routine.id && <div className="routine-actions"><button className="btn" onClick={() => { setMenu(null); void act(api().saveRoutine(botId, { ...routine, enabled: !routine.enabled })); }}>{routine.enabled ? "暂停" : "启用"}</button><button className="btn" onClick={() => { setMenu(null); void act(api().runRoutine(botId, routine.id)); }}>立即运行</button><button className="btn danger" onClick={() => setMenu(`delete:${routine.id}`)}>删除</button></div>}
      {menu === `delete:${routine.id}` && <div className="routine-actions"><span>删除这项定期任务？</span><button className="btn" onClick={() => setMenu(null)}>保留</button><button className="btn danger" onClick={() => { setMenu(null); void act(api().deleteRoutine(botId, routine.id)); }}>确认删除</button></div>}
    </div>)}</div> : <button className="routine-empty" aria-label="添加定期任务" onClick={() => setEditor("new")}><CalendarClock size={19} /><span>让重复工作按时运行<small>为这个 Bot 添加定期任务</small></span><Plus size={16} /></button>}
    <p className="local-schedule-note">仅在本机 Fenn Bot 运行时执行；需要操作许可时会等你确认。</p>
  </section>;
}
function RoutineForm({ botId, value, onClose }: { botId: string; value?: BotRoutine; onClose: () => void }) {
  const [name, setName] = useState(value?.name || ""), [prompt, setPrompt] = useState(value?.prompt || "");
  const [kind, setKind] = useState<string>(value?.schedule.kind === "daily" && value.schedule.weekdays?.length ? "weekly" : value?.schedule.kind || "daily");
  const [days, setDays] = useState(value?.schedule.kind === "daily" ? value.schedule.weekdays || [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(value?.schedule.kind === "daily" ? value.schedule.time : "09:00");
  const [minutes, setMinutes] = useState(value?.schedule.kind === "interval" ? value.schedule.minutes : 60);
  const [at, setAt] = useState(value?.schedule.kind === "once" ? new Date(value.schedule.at - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [cron, setCron] = useState(value?.schedule.kind === "cron" ? value.schedule.expr : "0 9 * * 1-5");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <form className="routine-form" onSubmit={async (event) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const schedule: Schedule = kind === "interval" ? { kind, minutes } : kind === "once" ? { kind, at: new Date(at).getTime() } : kind === "cron" ? { kind, expr: cron } : { kind: "daily", time, ...(kind === "weekdays" ? { weekdays: [1, 2, 3, 4, 5] } : kind === "weekly" ? { weekdays: days } : {}) };
      if (kind === "weekly" && !days.length) throw Error("请选择至少一天。");
      const input: RoutineInput = { id: value?.id, name, prompt, schedule, enabled: value?.enabled ?? true };
      await api().saveRoutine(botId, input); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }}>
    <button className="memory-back" type="button" onClick={onClose} disabled={busy}><ChevronLeft size={14} />返回详情</button>
    <h2>{value ? "编辑定期任务" : "添加定期任务"}</h2>
    <label className="field">名称<input autoFocus className="input" required value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="field">运行时间<SelectControl label="运行时间" value={kind} onChange={setKind} options={[{ value: "daily", label: "每天" }, { value: "weekdays", label: "工作日" }, { value: "weekly", label: "每周" }, { value: "interval", label: "固定间隔" }, { value: "once", label: "指定时间" }, { value: "cron", label: "自定义 cron" }]} /></label>
    {(kind === "daily" || kind === "weekdays" || kind === "weekly") && <label className="field">本地时间<input className="input" type="time" value={time} required onChange={(event) => setTime(event.target.value)} /></label>}
    {kind === "weekly" && <fieldset className="routine-days"><legend>重复日期</legend>{[1, 2, 3, 4, 5, 6, 0].map((day) => <label key={day}><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays(event.target.checked ? [...days, day] : days.filter((entry) => entry !== day))} /><span>{"一二三四五六日"[[1, 2, 3, 4, 5, 6, 0].indexOf(day)]}</span></label>)}</fieldset>}
    {kind === "interval" && <label className="field">间隔分钟<input className="input" type="number" min={5} value={minutes} required onChange={(event) => setMinutes(Number(event.target.value))} /></label>}
    {kind === "once" && <label className="field">运行日期与时间<input className="input" type="datetime-local" required value={at} onChange={(event) => setAt(event.target.value)} /></label>}
    {kind === "cron" && <label className="field">Cron 表达式<input className="input" value={cron} required onChange={(event) => setCron(event.target.value)} /></label>}
    <label className="field">任务指令<textarea className="textarea" rows={5} value={prompt} required onChange={(event) => setPrompt(event.target.value)} placeholder="到时需要这个 Bot 做什么？" /></label>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="memory-form-actions"><button className="btn" type="button" onClick={onClose} disabled={busy}>取消</button><button className="btn primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存"}</button></div>
  </form>;
}
