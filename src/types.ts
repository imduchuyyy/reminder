export type RepeatType = "none" | "daily" | "weekly" | "monthly";

export interface Task {
  id: number;
  chatId: number;
  title: string;
  description: string | null;
  dueTime: string; // ISO string
  repeat: RepeatType;
  completed: boolean;
  reminded: boolean;
  createdAt: string;
}

export interface CreateTaskInput {
  chatId: number;
  title: string;
  description?: string;
  dueTime: Date;
  repeat?: RepeatType;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  dueTime?: Date;
  repeat?: RepeatType;
  completed?: boolean;
  reminded?: boolean;
}
