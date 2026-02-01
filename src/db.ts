import { Database } from "bun:sqlite";
import { config } from "./config";
import type { Task, CreateTaskInput, UpdateTaskInput, RepeatType } from "./types";

const db = new Database(config.dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    dueTime TEXT NOT NULL,
    repeat TEXT DEFAULT 'none',
    completed INTEGER DEFAULT 0,
    reminded INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_tasks_chatId ON tasks(chatId);
  CREATE INDEX IF NOT EXISTS idx_tasks_dueTime ON tasks(dueTime);
`);

// Prepared statements
const insertTask = db.prepare(`
  INSERT INTO tasks (chatId, title, description, dueTime, repeat)
  VALUES (?, ?, ?, ?, ?)
`);

const selectTasksByChat = db.prepare(`
  SELECT * FROM tasks WHERE chatId = ? ORDER BY dueTime ASC
`);

const selectTaskById = db.prepare(`
  SELECT * FROM tasks WHERE id = ? AND chatId = ?
`);

const selectDueTasks = db.prepare(`
  SELECT * FROM tasks 
  WHERE completed = 0 
    AND reminded = 0 
    AND datetime(dueTime) <= datetime('now')
`);

const selectTodayTasks = db.prepare(`
  SELECT * FROM tasks 
  WHERE chatId = ? 
    AND date(dueTime) = date('now', 'localtime')
  ORDER BY dueTime ASC
`);

const deleteTaskStmt = db.prepare(`
  DELETE FROM tasks WHERE id = ? AND chatId = ?
`);

function rowToTask(row: unknown): Task {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    chatId: r.chatId as number,
    title: r.title as string,
    description: r.description as string | null,
    dueTime: r.dueTime as string,
    repeat: r.repeat as RepeatType,
    completed: Boolean(r.completed),
    reminded: Boolean(r.reminded),
    createdAt: r.createdAt as string,
  };
}

export function createTask(input: CreateTaskInput): Task {
  const result = insertTask.run(
    input.chatId,
    input.title,
    input.description || null,
    input.dueTime.toISOString(),
    input.repeat || "none"
  );
  return getTaskById(Number(result.lastInsertRowid), input.chatId)!;
}

export function getTasks(chatId: number): Task[] {
  const rows = selectTasksByChat.all(chatId);
  return rows.map(rowToTask);
}

export function getTaskById(id: number, chatId: number): Task | null {
  const row = selectTaskById.get(id, chatId);
  return row ? rowToTask(row) : null;
}

export function getDueTasks(): Task[] {
  const rows = selectDueTasks.all();
  return rows.map(rowToTask);
}

export function getTodayTasks(chatId: number): Task[] {
  const rows = selectTodayTasks.all(chatId);
  return rows.map(rowToTask);
}

export function updateTask(id: number, chatId: number, updates: UpdateTaskInput): Task | null {
  const task = getTaskById(id, chatId);
  if (!task) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.dueTime !== undefined) {
    fields.push("dueTime = ?");
    values.push(updates.dueTime.toISOString());
  }
  if (updates.repeat !== undefined) {
    fields.push("repeat = ?");
    values.push(updates.repeat);
  }
  if (updates.completed !== undefined) {
    fields.push("completed = ?");
    values.push(updates.completed ? 1 : 0);
  }
  if (updates.reminded !== undefined) {
    fields.push("reminded = ?");
    values.push(updates.reminded ? 1 : 0);
  }

  if (fields.length === 0) return task;

  values.push(id, chatId);
  const sql = `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND chatId = ?`;
  db.prepare(sql).run(...(values as (string | number | null)[]));

  return getTaskById(id, chatId);
}

export function deleteTask(id: number, chatId: number): boolean {
  const result = deleteTaskStmt.run(id, chatId);
  return result.changes > 0;
}

export function rescheduleRepeatingTask(task: Task): Task | null {
  if (task.repeat === "none") return null;

  const dueDate = new Date(task.dueTime);
  let nextDate: Date;

  switch (task.repeat) {
    case "daily":
      nextDate = new Date(dueDate.getTime() + 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      nextDate = new Date(dueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      nextDate = new Date(dueDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    default:
      return null;
  }

  return updateTask(task.id, task.chatId, {
    dueTime: nextDate,
    completed: false,
    reminded: false,
  });
}
