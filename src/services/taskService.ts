import { invoke } from "@tauri-apps/api/core";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/task";

export const taskService = {
  exportBackup(path: string): Promise<number> {
    return invoke("export_backup", { path });
  },
  importBackup(path: string): Promise<{ imported: number; skipped: number }> {
    return invoke("import_backup", { path });
  },
  create(input: CreateTaskInput): Promise<Task> {
    return invoke("create_task", { input });
  },
  list(date?: string): Promise<Task[]> {
    return invoke("list_tasks", { date: date ?? null });
  },
  get(id: string): Promise<Task | null> {
    return invoke("get_task", { id });
  },
  update(input: UpdateTaskInput): Promise<Task> {
    return invoke("update_task", { input });
  },
  delete(id: string): Promise<boolean> {
    return invoke("delete_task", { id });
  },
  restore(id: string): Promise<boolean> {
    return invoke("restore_task", { id });
  },
  listDeleted(): Promise<Task[]> {
    return invoke("list_deleted_tasks");
  },
  snooze(id: string, minutes: 10 | 30 | 60): Promise<void> {
    return invoke("snooze_task", { id, minutes });
  },
  addSubtask(taskId: string, title: string): Promise<Task> {
    return invoke("add_subtask", { taskId, title });
  },
  setSubtaskCompleted(id: string, completed: boolean): Promise<Task> {
    return invoke("set_subtask_completed", { id, completed });
  },
  deleteSubtask(id: string): Promise<Task> {
    return invoke("delete_subtask", { id });
  },
};
