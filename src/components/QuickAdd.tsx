import { useEffect, useRef, useState } from "react";
import type { Translation } from "../i18n";
import type { TaskPriority } from "../types/task";

interface Props {
  t: Translation;
  onAdd: (title: string, priority: TaskPriority) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
}

export function QuickAdd({ t, onAdd, onCancel, onError }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) { onError(t.invalidTitle); inputRef.current?.focus(); return; }
    setBusy(true);
    try {
      await onAdd(title.trim(), priority);
      setTitle("");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return <form className="quick-add" onSubmit={(event) => void submit(event)} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
    <label htmlFor="quick-title">{t.addTask}</label>
    <input ref={inputRef} id="quick-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.taskPlaceholder} maxLength={200} />
    <div className="quick-add-bottom">
      <div className="priority-picker" role="group" aria-label={t.priority}>
        {(["low", "medium", "high"] as const).map((value) => <button key={value} type="button" className={priority === value ? "selected" : ""} aria-pressed={priority === value} onClick={() => setPriority(value)}>{t[value]}</button>)}
      </div>
      <button className="primary-button compact" type="submit" disabled={busy}>{t.add}</button>
    </div>
  </form>;
}
