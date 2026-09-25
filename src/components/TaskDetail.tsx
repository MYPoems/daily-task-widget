import { useEffect, useState, type FormEvent } from "react";
import type { Language, Translation } from "../i18n";
import type { Task, TaskPriority, TaskStatus, UpdateTaskInput } from "../types/task";
import { taskService } from "../services/taskService";

interface Props {
  task: Task;
  language: Language;
  t: Translation;
  onBack: () => void;
  onSave: (input: UpdateTaskInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddSubtask: (taskId: string, title: string) => Promise<void>;
  onToggleSubtask: (id: string, completed: boolean) => Promise<void>;
  onDeleteSubtask: (id: string) => Promise<void>;
  onError: (error: unknown) => void;
}

export function TaskDetail({ task, language, t, onBack, onSave, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask, onError }: Props) {
  const [draft, setDraft] = useState<UpdateTaskInput>({
    id: task.id,
    title: task.title,
    description: task.description,
    date: task.date,
    status: task.status,
    progress: task.progress,
    priority: task.priority,
    reminder: { ...task.reminder },
    notes: task.notes,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSubtaskId, setConfirmSubtaskId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const locale = language === "zh" ? "zh-CN" : "en-US";

  useEffect(() => {
    if (task.subtasks.length > 0) setDraft((current) => ({ ...current, status: task.status, progress: task.progress }));
  }, [task.status, task.progress, task.subtasks.length]);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.title.trim()) { onError(t.invalidTitle); return; }
    setBusy(true);
    try {
      await onSave({ ...draft, title: draft.title.trim() });
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    try {
      await onDelete(task.id);
    } catch (error) {
      onError(error);
      setBusy(false);
    }
  }

  async function toggleComplete() {
    setBusy(true);
    try {
      await onSave({
        ...draft,
        status: draft.status === "done" ? "doing" : "done",
        progress: draft.status === "done" ? 95 : 100,
      });
    } catch (error) {
      onError(error);
      setBusy(false);
    }
  }

  function setProgress(progress: number) {
    setDraft((current) => ({ ...current, progress, status: progress >= 100 ? "done" : progress === 0 ? "todo" : "doing" }));
  }

  function setStatus(status: TaskStatus) {
    setDraft((current) => ({ ...current, status, progress: status === "done" ? 100 : Math.min(current.progress, 95) }));
  }

  async function addChild() {
    const title = subtaskTitle.trim();
    if (!title) { onError(t.invalidTitle); return; }
    setBusy(true);
    try { await onAddSubtask(task.id, title); setSubtaskTitle(""); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  async function toggleChild(id: string, completed: boolean) {
    setBusy(true);
    try { await onToggleSubtask(id, completed); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  async function removeChild(id: string) {
    if (confirmSubtaskId !== id) { setConfirmSubtaskId(id); return; }
    setBusy(true);
    try { await onDeleteSubtask(id); setConfirmSubtaskId(null); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  return <div className="page detail-page">
    <div className="page-heading"><button className="text-button" type="button" onClick={onBack}>← {t.back}</button><h2>{t.editTask}</h2></div>
    <form onSubmit={(event) => void save(event)}>
      <label className="field"><span>{t.title}</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={200} required /></label>
      <label className="field"><span>{t.description}</span><textarea value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></label>
      <div className="field-row">
        <label className="field"><span>{t.date}</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label>
        <label className="field"><span>{t.priority}</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}><option value="low">{t.low}</option><option value="medium">{t.medium}</option><option value="high">{t.high}</option></select></label>
      </div>
      <div className="field-row">
        <label className="field"><span>{t.status}</span><select value={draft.status} disabled={task.subtasks.length > 0} onChange={(event) => setStatus(event.target.value as TaskStatus)}><option value="todo">{t.todo}</option><option value="doing">{t.doing}</option><option value="done">{t.done}</option></select></label>
        <label className="field"><span>{t.progress}: {draft.progress}%</span><input type="range" min="0" max="100" step="5" value={draft.progress} disabled={task.subtasks.length > 0} onChange={(event) => setProgress(Number(event.target.value))} /></label>
      </div>
      <section className="detail-subtasks"><div className="subtask-heading"><h3>{t.subtasks}</h3>{task.subtasks.length > 0 && <span>{t.subtaskCount(task.subtasks.filter((item) => item.completed).length, task.subtasks.length)}</span>}</div>
        {task.subtasks.length > 0 && <><p className="auto-progress-note">{t.automaticProgress}</p><div className="detail-subtask-list">{task.subtasks.map((item) => <div className="detail-subtask" key={item.id}><label><input type="checkbox" checked={item.completed} disabled={busy} onChange={(event) => void toggleChild(item.id, event.target.checked)} /><span className={item.completed ? "is-complete" : ""}>{item.title}</span></label><button type="button" disabled={busy} aria-label={`${t.removeSubtask}: ${item.title}`} onClick={() => void removeChild(item.id)}>{confirmSubtaskId === item.id ? t.confirmDelete : "×"}</button></div>)}</div></>}
        <div className="subtask-add"><input value={subtaskTitle} maxLength={200} placeholder={t.subtaskPlaceholder} aria-label={t.subtaskPlaceholder} onChange={(event) => setSubtaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addChild(); } }} /><button type="button" disabled={busy || !subtaskTitle.trim()} onClick={() => void addChild()}>{t.addSubtask}</button></div>
      </section>
      <div className="reminder-row"><label className="check-label"><input type="checkbox" checked={draft.reminder.enabled} onChange={(event) => setDraft({ ...draft, reminder: { enabled: event.target.checked, time: event.target.checked ? draft.reminder.time ?? "09:00" : null } })} />{t.reminder}</label>{draft.reminder.enabled && <label className="field"><span>{t.reminderTime}</span><input type="time" value={draft.reminder.time ?? "09:00"} onChange={(event) => setDraft({ ...draft, reminder: { enabled: true, time: event.target.value } })} required /></label>}</div>
      <label className="field"><span>{t.notes}</span><textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={4} /></label>
      <div className="timestamps"><span>{t.createdAt}: {new Date(task.createdAt).toLocaleString(locale)}</span><span>{t.updatedAt}: {new Date(task.updatedAt).toLocaleString(locale)}</span></div>
      <div className="detail-actions"><button className="primary-button" type="submit" disabled={busy}>{t.save}</button>{task.subtasks.length === 0 && <button className="secondary-button" type="button" disabled={busy} onClick={() => void toggleComplete()}>{draft.status === "done" ? t.reopen : t.complete}</button>}</div>
      {task.reminder.enabled && task.status !== "done" && <div className="snooze-actions">{([10, 30, 60] as const).map((minutes) => <button key={minutes} type="button" disabled={busy} onClick={() => void taskService.snooze(task.id, minutes).then(onBack).catch(onError)}>{minutes === 10 ? t.snooze10 : minutes === 30 ? t.snooze30 : t.snooze60}</button>)}</div>}
      <button className="delete-button" type="button" disabled={busy} onClick={() => void remove()}>{confirmDelete ? t.confirmDelete : t.delete}</button>
    </form>
  </div>;
}
