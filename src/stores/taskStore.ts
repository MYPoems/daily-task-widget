import { create } from "zustand";
import { taskService } from "../services/taskService";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/task";
import { todayKey } from "../utils/date";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  loadToday: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (input: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  addSubtask: (taskId: string, title: string) => Promise<Task>;
  setSubtaskCompleted: (id: string, completed: boolean) => Promise<Task>;
  deleteSubtask: (id: string) => Promise<Task>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  async loadToday() {
    set({ loading: true });
    try {
      set({ tasks: await taskService.list(todayKey()) });
    } finally {
      set({ loading: false });
    }
  },
  async createTask(input) {
    const task = await taskService.create(input);
    await get().loadToday();
    return task;
  },
  async updateTask(input) {
    const task = await taskService.update(input);
    await get().loadToday();
    return task;
  },
  async deleteTask(id) {
    await taskService.delete(id);
    await get().loadToday();
  },
  async addSubtask(taskId, title) {
    const task = await taskService.addSubtask(taskId, title);
    await get().loadToday();
    return task;
  },
  async setSubtaskCompleted(id, completed) {
    const task = await taskService.setSubtaskCompleted(id, completed);
    await get().loadToday();
    return task;
  },
  async deleteSubtask(id) {
    const task = await taskService.deleteSubtask(id);
    await get().loadToday();
    return task;
  },
}));
