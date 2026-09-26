import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type View = "today" | "schedule" | "detail" | "settings";
type TaskListView = "today" | "schedule";

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
    recurrence: task.recurrence,
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
  const [returnView, setReturnView] = useState<TaskListView>("today");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [undoTaskId, setUndoTaskId] = useState<string | null>(null);
  const [today, setToday] = useState(todayKey);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const createTask = useTaskStore((state) => state.createTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const restoreTask = useTaskStore((state) => state.restoreTask);
  const addSubtask = useTaskStore((state) => state.addSubtask);
  const setSubtaskCompleted = useTaskStore((state) => state.setSubtaskCompleted);
  const deleteSubtask = useTaskStore((state) => state.deleteSubtask);
  const theme = useSettingsStore((state) => state.theme);
  const opacity = useSettingsStore((state) => state.opacity);
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const setAlwaysOnTop = useSettingsStore((state) => state.setAlwaysOnTop);
  const t = copy[language];

  const showError = useCallback((error: unknown) => {
    setUndoTaskId(null);
    setToast(error instanceof Error ? error.message : String(error));
  }, []);

  useEffect(() => {
    void loadTasks().catch(showError);
    let timer: ReturnType<typeof setTimeout>;
    function nextDay() {
      timer = setTimeout(() => {
        setToday(todayKey());
        void loadTasks().catch(showError);
        nextDay();
      }, untilNextLocalDay() + 50);
    }
    nextDay();
    return () => clearTimeout(timer);
  }, [loadTasks, showError]);

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
    const timer = setTimeout(() => { setToast(null); setUndoTaskId(null); }, undoTaskId ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, undoTaskId]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setView("schedule");
        setQuickAdd(false);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  const todayTasks = useMemo(() => tasks.filter((task) => task.date === today), [tasks, today]);
  const activeTasks = useMemo(() => todayTasks.filter((task) => task.status !== "done").sort(byPriority), [todayTasks]);
  const completedTasks = useMemo(() => todayTasks.filter((task) => task.status === "done").sort(byPriority), [todayTasks]);
  const overdueTasks = useMemo(() => tasks.filter((task) => task.date < today && task.status !== "done").sort(byPriority), [tasks, today]);
  const upcomingTasks = useMemo(() => tasks.filter((task) => task.date > today && task.status !== "done").sort(byPriority), [tasks, today]);
  const otherCompletedTasks = useMemo(() => tasks.filter((task) => task.date !== today && task.status === "done").sort(byPriority), [tasks, today]);
  const otherCount = overdueTasks.length + upcomingTasks.length + otherCompletedTasks.length;
  const hasScheduleFilter = Boolean(searchQuery.trim() || dateFilter);
  const matchingTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return tasks.filter((task) => (!dateFilter || task.date === dateFilter)
      && (!query || [task.title, task.description, task.notes].some((value) => value?.toLocaleLowerCase().includes(query))));
  }, [tasks, searchQuery, dateFilter]);
  const scheduleOverdue = matchingTasks.filter((task) => task.date < today && task.status !== "done").sort(byPriority);
  const scheduleUpcoming = matchingTasks.filter((task) => task.date > today && task.status !== "done").sort(byPriority);
  const scheduleCompleted = matchingTasks.filter((task) => task.date !== today && task.status === "done").sort(byPriority);
  const scheduleTodayActive = hasScheduleFilter ? matchingTasks.filter((task) => task.date === today && task.status !== "done").sort(byPriority) : [];
  const scheduleTodayDone = hasScheduleFilter ? matchingTasks.filter((task) => task.date === today && task.status === "done").sort(byPriority) : [];
  const scheduleCount = scheduleOverdue.length + scheduleUpcoming.length + scheduleCompleted.length + scheduleTodayActive.length + scheduleTodayDone.length;
  const progress = todayTasks.length ? Math.round(todayTasks.reduce((sum, task) => sum + task.progress, 0) / todayTasks.length) : 0;
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

  function openTask(task: Task, from: TaskListView) {
    setSelectedTask(task);
    setReturnView(from);
    setView("detail");
  }

  async function moveToToday(task: Task) {
    await updateTask(asUpdate(task, { date: todayKey() }));
  }

  async function saveDetail(input: UpdateTaskInput) {
    await updateTask(input);
    setSelectedTask(null);
    setView(returnView);
  }

  async function removeTask(id: string) {
    await deleteTask(id);
    setSelectedTask(null);
    setView(returnView);
    setUndoTaskId(id);
    setToast(t.taskDeleted);
  }

  async function undoDelete() {
    if (!undoTaskId) return;
    await restoreTask(undoTaskId);
    setUndoTaskId(null);
    setToast(t.taskRestored);
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
        <button className="icon-button" type="button" aria-label={t.searchTasks} onClick={() => { setView("schedule"); setQuickAdd(false); requestAnimationFrame(() => searchRef.current?.focus()); }}>⌕</button>
        <button className="icon-button language-switch" type="button" aria-label={t.switchLanguage} onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>{language === "zh" ? "EN" : "中"}</button>
        <button className="icon-button" type="button" aria-label={t.settings} onClick={() => { setView("settings"); setQuickAdd(false); }}>⚙</button>
        <button className="icon-button" type="button" aria-label={t.close} onClick={() => { if (isTauri()) void getCurrentWindow().hide().catch(showError); }}>×</button>
      </div>
    </div>

    {view === "settings" ? <Settings t={t} language={language} onLanguage={setLanguage} onBack={() => setView("today")} onAlwaysOnTop={changeAlwaysOnTop} onError={showError} onImported={loadTasks} onNotice={setToast} />
      : view === "detail" && selectedTask ? <TaskDetail key={selectedTask.id} task={selectedTask} language={language} t={t} onBack={() => setView(returnView)} onSave={saveDetail} onDelete={removeTask} onAddSubtask={addChild} onToggleSubtask={toggleChild} onDeleteSubtask={removeChild} onError={showError} />
      : view === "schedule" ? <div className="page schedule-page">
        <div className="page-heading"><button className="text-button" type="button" onClick={() => setView("today")}>← {t.back}</button><h2>{t.otherDates}</h2></div>
        <div className="schedule-filters"><label><span>{t.searchTasks}</span><input ref={searchRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t.searchPlaceholder} /></label><label><span>{t.filterDate}</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label></div>
        {hasScheduleFilter && <button className="clear-filters" type="button" onClick={() => { setSearchQuery(""); setDateFilter(""); searchRef.current?.focus(); }}>{t.clearFilters}</button>}
        {loading && tasks.length === 0 ? <p className="loading">{t.loading}</p>
          : scheduleCount === 0 ? <section className="empty-state"><div className="empty-icon" aria-hidden="true">⌕</div><h2>{hasScheduleFilter ? t.noSearchResults : t.noOtherDates}</h2></section>
          : <>
            {scheduleTodayActive.length > 0 && <section className="task-section schedule-section"><h2>{t.today} · {scheduleTodayActive.length}</h2>{scheduleTodayActive.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "schedule")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} showDate />)}</section>}
            {scheduleOverdue.length > 0 && <section className="task-section schedule-section"><h2>{t.overdueTasks} · {scheduleOverdue.length}</h2>{scheduleOverdue.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "schedule")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} showDate onMoveToToday={moveToToday} />)}</section>}
            {scheduleUpcoming.length > 0 && <section className="task-section schedule-section"><h2>{t.upcomingTasks} · {scheduleUpcoming.length}</h2>{scheduleUpcoming.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "schedule")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} showDate />)}</section>}
            {scheduleTodayDone.length > 0 && <section className="task-section schedule-section completed-section"><h2>{t.completedTasks} · {scheduleTodayDone.length}</h2>{scheduleTodayDone.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "schedule")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} showDate />)}</section>}
            {scheduleCompleted.length > 0 && <section className="task-section schedule-section completed-section"><h2>{t.otherCompletedTasks} · {scheduleCompleted.length}</h2>{scheduleCompleted.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "schedule")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} showDate />)}</section>}
          </>}
      </div>
      : <div className="today-page">
        <header className="widget-header">
          <div><h1>{t.today}</h1><p className="date">{dateLabel}</p></div>
          <span className="task-count">{t.taskCount(todayTasks.length)}</span>
        </header>
        <section className="progress-summary" aria-label={t.progress}>
          <div className="summary-line"><span>{t.progress}</span><strong>{progress}%</strong></div>
          <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <p>{t.completed(completedTasks.length, todayTasks.length)}</p>
        </section>
        {otherCount > 0 && <button className="other-dates-link" type="button" onClick={() => { setQuickAdd(false); setView("schedule"); }}><span>{t.otherDates}<span aria-hidden="true">›</span></span><small>{t.otherDatesCounts(overdueTasks.length, upcomingTasks.length, otherCompletedTasks.length)}</small></button>}
        <div className="task-list">
          {loading && tasks.length === 0 ? <p className="loading">{t.loading}</p>
            : todayTasks.length === 0 ? <section className="empty-state"><div className="empty-icon" aria-hidden="true">✓</div><h2>{t.emptyTitle}</h2><p>{t.emptyHint}</p></section>
            : <>
              {activeTasks.length > 0 && <section className="task-section"><h2>{t.activeTasks}</h2>{activeTasks.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "today")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} />)}</section>}
              {completedTasks.length > 0 && <section className="task-section completed-section"><h2>{t.completedTasks}</h2>{completedTasks.map((task) => <TaskItem key={task.id} task={task} t={t} onOpen={(item) => openTask(item, "today")} onProgress={changeProgress} onComplete={toggleComplete} onSubtask={toggleChild} onError={showError} />)}</section>}
            </>}
        </div>
        <footer className="widget-footer">{quickAdd ? <QuickAdd t={t} onAdd={addTask} onCancel={() => setQuickAdd(false)} onError={showError} /> : <button className="add-task-button" type="button" onClick={() => setQuickAdd(true)}><span>＋</span>{t.addTask}</button>}</footer>
      </div>}
    {toast && <div className="toast" role="status"><span>{toast}</span>{undoTaskId && <button type="button" onClick={() => void undoDelete().catch(showError)}>{t.undo}</button>}</div>}
  </main>;
}

export default App;
