import { memo, useState } from "react";
import type { Translation } from "../i18n";
import type { Task } from "../types/task";

interface Props {
  task: Task;
  t: Translation;
  onOpen: (task: Task) => void;
  onProgress: (task: Task, progress: number) => Promise<void>;
  onComplete: (task: Task) => Promise<void>;
  onSubtask: (id: string, completed: boolean) => Promise<void>;
  onError: (error: unknown) => void;
}

export const TaskItem = memo(function TaskItem({ task, t, onOpen, onProgress, onComplete, onSubtask, onError }: Props) {
  const [adjusting, setAdjusting] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = task.status === "done";

  async function changeProgress(delta: number) {
    setBusy(true);
    try {
      await onProgress(task, Math.max(0, Math.min(100, task.progress + delta)));
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function toggleComplete() {
    setBusy(true);
    try {
      await onComplete(task);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubtask(id: string, completed: boolean) {
    setBusy(true);
    try { await onSubtask(id, completed); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  return (
    <article className={`task-item ${done ? "is-done" : ""}`}>
      <div className="task-main">
        {task.subtasks.length > 0
          ? <span className="complete-toggle computed-toggle" role="img" aria-label={done ? t.done : t.automaticProgress}>{done ? "✓" : ""}</span>
          : <button className="complete-toggle" type="button" aria-label={done ? t.reopen : t.complete} aria-pressed={done} disabled={busy} onClick={toggleComplete}>{done ? "✓" : ""}</button>}
        <div className="task-body">
          <button className="task-title" type="button" onClick={() => onOpen(task)}>{task.title}</button>
          <span className={`priority priority-${task.priority}`}><span className="priority-dot" />{t[task.priority]}</span>
          {task.subtasks.length > 0 && <span className="subtask-count">{t.subtaskCount(task.subtasks.filter((item) => item.completed).length, task.subtasks.length)}</span>}
        </div>
        {!done && <strong className="task-percent">{task.progress}%</strong>}
      </div>
      {!done && task.subtasks.length === 0 && (
        <>
          <button className="task-progress-button" type="button" aria-label={`${t.progressControl}: ${task.title}, ${task.progress}%`} aria-expanded={adjusting} onClick={() => setAdjusting(!adjusting)}>
            <span className="task-progress-track"><span style={{ width: `${task.progress}%` }} /></span>
          </button>
          {adjusting && <div className="progress-controls" aria-label={t.progressControl}>
            {[-10, -5, 5, 10].map((delta) => <button key={delta} type="button" disabled={busy} onClick={() => void changeProgress(delta)}>{delta > 0 ? `+${delta}` : delta}</button>)}
          </div>}
        </>
      )}
      {!done && task.subtasks.length > 0 && <div className="task-progress-static" aria-label={`${t.progress}: ${task.progress}%`}><span className="task-progress-track"><span style={{ width: `${task.progress}%` }} /></span></div>}
      {task.subtasks.length > 0 && <div className="subtask-list-inline">{task.subtasks.map((item) => <label key={item.id} className={`subtask-inline ${item.completed ? "is-complete" : ""}`}><input type="checkbox" checked={item.completed} disabled={busy} onChange={(event) => void toggleSubtask(item.id, event.target.checked)} /><span>{item.title}</span></label>)}</div>}
    </article>
  );
});
