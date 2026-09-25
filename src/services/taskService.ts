import { invoke } from "@tauri-apps/api/core";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/task";

export const taskService = {
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
