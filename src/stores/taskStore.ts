import { create } from "zustand";
import { taskService } from "../services/taskService";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/task";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  loadTasks: () => Promise<void>;
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
  async loadTasks() {
    set({ loading: true });
    try {
      set({ tasks: await taskService.list() });
    } finally {
      set({ loading: false });
    }
  },
  async createTask(input) {
    const task = await taskService.create(input);
    await get().loadTasks();
    return task;
  },
  async updateTask(input) {
    const task = await taskService.update(input);
    await get().loadTasks();
    return task;
  },
  async deleteTask(id) {
    await taskService.delete(id);
    await get().loadTasks();
  },
  async addSubtask(taskId, title) {
    const task = await taskService.addSubtask(taskId, title);
    await get().loadTasks();
    return task;
  },
  async setSubtaskCompleted(id, completed) {
    const task = await taskService.setSubtaskCompleted(id, completed);
    await get().loadTasks();
    return task;
  },
  async deleteSubtask(id) {
    const task = await taskService.deleteSubtask(id);
    await get().loadTasks();
    return task;
  },
}));
