export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Reminder {
  enabled: boolean;
  time?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  date: string;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  reminder: Reminder;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  date: string;
  priority: TaskPriority;
  reminder?: Reminder | null;
  notes?: string | null;
}

export type UpdateTaskInput = Omit<Task, "createdAt" | "updatedAt" | "subtasks">;
