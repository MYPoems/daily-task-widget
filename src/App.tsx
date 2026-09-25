import { useCallback, useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { QuickAdd } from "./components/QuickAdd";
import { Settings } from "./components/Settings";
import { TaskDetail } from "./components/TaskDetail";
import { TaskItem } from "./components/TaskItem";
import { copy, loadLanguage, saveLanguage, type Language } from "./i18n";
import { useSettingsStore } from "./stores/settingsStore";
import { useTaskStore } from "./stores/taskStore";
import type { Task, UpdateTaskInput } from "./types/task";
import { todayKey, untilNextLocalDay } from "./utils/date";
import "./App.css";

type View = "today" | "detail" | "settings";

function asUpdate(task: Task, changes: Partial<UpdateTaskInput>): UpdateTaskInput {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    date: task.date,
    status: task.status,
    progress: task.progress,
    priority: task.priority,
    reminder: task.reminder,
    notes: task.notes,
    ...changes,
  };
}

const priorityRank: Record<Task["priority"], number> = { high: 2, medium: 1, low: 0 };
function byPriority(a: Task, b: Task): number {
  return priorityRank[b.priority] - priorityRank[a.priority]
    || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

function App() {
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [view, setView] = useState<View>("today");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [today, setToday] = useState(todayKey);
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const loadToday = useTaskStore((state) => state.loadToday);
  const createTask = useTaskStore((state) => state.createTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const addSubtask = useTaskStore((state) => state.addSubtask);
  const setSubtaskCompleted = useTaskStore((state) => state.setSubtaskCompleted);
  const deleteSubtask = useTaskStore((state) => state.deleteSubtask);
  const theme = useSettingsStore((state) => state.theme);
  const opacity = useSettingsStore((state) => state.opacity);
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const setAlwaysOnTop = useSettingsStore((state) => state.setAlwaysOnTop);
  const t = copy[language];

  const showError = useCallback((error: unknown) => {
    setToast(error instanceof Error ? error.message : String(error));
  }, []);

  useEffect(() => {
    void loadToday().catch(showError);
    let timer: ReturnType<typeof setTimeout>;
    function nextDay() {
      timer = setTimeout(() => {
        setToday(todayKey());
        void loadToday().catch(showError);
        nextDay();
      }, untilNextLocalDay() + 50);
    }
    nextDay();
    return () => clearTimeout(timer);
  }, [loadToday, showError]);

  useEffect(() => {
    saveLanguage(language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = t.appTitle;
    if (isTauri()) void getCurrentWindow().setTitle(t.appTitle).catch(showError);
  }, [language, t.appTitle, showError]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--widget-opacity", String(opacity / 100));
  }, [theme, opacity]);

  useEffect(() => {
    if (isTauri()) void getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch(showError);
  }, [alwaysOnTop, showError]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: Array<() => void> = [];
    let cancelled = false;
    void Promise.all([
      listen("open-quick-add", () => { setView("today"); setQuickAdd(true); }),
      listen("open-settings", () => { setView("settings"); setQuickAdd(false); }),
    ]).then((callbacks) => {
      if (cancelled) callbacks.forEach((callback) => callback());
      else unlisten = callbacks;
    }).catch(showError);
    return () => { cancelled = true; unlisten.forEach((callback) => callback()); };
  }, [showError]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "done").sort(byPriority), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === "done").sort(byPriority), [tasks]);
  const progress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0;
  const dateLabel = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    weekday: "long", month: "long", day: "numeric",
  }).format(new Date(`${today}T12:00:00`));

  async function addTask(title: string, priority: Task["priority"]) {
    await createTask({ title, date: todayKey(), priority });
    setQuickAdd(false);
  }

  async function changeProgress(task: Task, value: number) {
    await updateTask(asUpdate(task, { progress: value, status: value >= 100 ? "done" : value === 0 ? "todo" : "doing" }));
  }

  async function toggleComplete(task: Task) {
    await updateTask(asUpdate(task, task.status === "done"
      ? { status: "doing", progress: 95 }
      : { status: "done", progress: 100 }));
  }

  async function saveDetail(input: UpdateTaskInput) {
    await updateTask(input);
    setSelectedTask(null);
    setView("today");
  }

  async function removeTask(id: string) {
    await deleteTask(id);
    setSelectedTask(null);
    setView("today");
  }

  async function changeAlwaysOnTop(enabled: boolean) {
    if (isTauri()) await getCurrentWindow().setAlwaysOnTop(enabled);
    setAlwaysOnTop(enabled);
  }

  async function addChild(taskId: string, title: string) {
    const updated = await addSubtask(taskId, title);
    setSelectedTask(updated);
  }

  async function toggleChild(id: string, completed: boolean) {
    const updated = await setSubtaskCompleted(id, completed);
    setSelectedTask((current) => current?.id === updated.id ? updated : current);
  }

  async function removeChild(id: string) {
    const updated = await deleteSubtask(id);
    setSelectedTask(updated);
  }

  return <main className="widget">
    <div className="topbar" data-tauri-drag-region>
      <span className="drag-label" data-tauri-drag-region>{t.eyebrow}</span>
      <div className="topbar-actions">
        <button className="icon-button language-switch" type="button" aria-label={t.switchLanguage} onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>{language === "zh" ? "EN" : "中"}</button>
        <button className="icon-button" type="button" aria-label={t.settings} onClick={() => { setView("settings"); setQuickAdd(false); }}>⚙</button>
        <button className="icon-button" type="button" aria-label={t.close} onClick={() => { if (isTauri()) void getCurrentWindow().hide().catch(showError); }}>×</button>
      </div>
    </div>

    {view === "settings" ? <Settings t={t} language={language} onLanguage={setLanguage} onBack={() => setView("today")} onAlwaysOnTop={changeAlwaysOnTop} onError={showError} />
      : view === "detail" && selectedTask ? <TaskDetail key={selectedTask.id} task={selectedTask} language={language} t={t} onBack={() => setView("today")} onSave={saveDetail} onDelete={removeTask} onAddSubtask={addChild} onToggleSubtask={toggleChild} onDeleteSubtask={removeChild} onError={showError} />
      : <div className="today-page">
        <header className="widget-header">
          <div><h1>{t.today}</h1><p className="date">{dateLabel}</p></div>
          <span className="task-count">{t.taskCount(tasks.length)}</span>
        </header>
        <section className="progress-summary" aria-label={t.progress}>
          <div className="summary-line"><span>{t.progress}</span><strong>{progress}%</strong></div>
          <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <p>{t.completed(completedTasks.length, tasks.length)}</p>
        </section>
        <div className="task-list">
          {loading && tasks.length === 0 ? <p className="loading">{t.loading}</p>
            : tasks.length === 0 ? <section className="empty-state"><div className="empty-icon" aria-hidden="true">✓</div><h2>{t.emptyTitle}</h2><p>{t.emptyHint}</p></section>
            : <>
              {activeTasks.length > 0 && <section className="task-section"><h2>{t.activeTasks}</h2>{activeTasks.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => { setSelectedTask(item); setView("detail"); }} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} />)}</section>}
              {completedTasks.length > 0 && <section className="task-section completed-section"><h2>{t.completedTasks}</h2>{completedTasks.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => { setSelectedTask(item); setView("detail"); }} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} />)}</section>}
            </>}
        </div>
        <footer className="widget-footer">{quickAdd ? <QuickAdd t={t} onAdd={addTask} onCancel={() => setQuickAdd(false)} onError={showError} /> : <button className="add-task-button" type="button" onClick={() => setQuickAdd(true)}><span>＋</span>{t.addTask}</button>}</footer>
      </div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

export default App;
