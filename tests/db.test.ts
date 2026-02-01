// Import setup FIRST to configure environment before other imports
import "./setup";

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { TEST_DB_PATH, cleanupTestDb } from "./setup";

// Now import db functions - table will be created automatically
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getDueTasks,
  rescheduleRepeatingTask,
} from "../src/db";

describe("Database Operations", () => {
  const testChatId = 12345;

  beforeEach(() => {
    // Clear tasks using direct sqlite connection
    const db = new Database(TEST_DB_PATH);
    try {
      db.exec(`DELETE FROM tasks WHERE chatId = ${testChatId}`);
      db.exec(`DELETE FROM tasks WHERE chatId = ${testChatId + 1}`);
    } catch {
      // Table might not exist yet in first test
    }
    db.close();
  });

  afterAll(() => {
    cleanupTestDb();
  });

  describe("createTask", () => {
    test("should create a task with all fields", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);

      const task = createTask({
        chatId: testChatId,
        title: "Test Task",
        description: "Test description",
        dueTime,
        repeat: "daily",
      });

      expect(task).toBeDefined();
      expect(task.id).toBeGreaterThan(0);
      expect(task.chatId).toBe(testChatId);
      expect(task.title).toBe("Test Task");
      expect(task.description).toBe("Test description");
      expect(task.repeat).toBe("daily");
      expect(task.completed).toBe(false);
      expect(task.reminded).toBe(false);
    });

    test("should create a task without description", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);

      const task = createTask({
        chatId: testChatId,
        title: "Task without description",
        dueTime,
      });

      expect(task.title).toBe("Task without description");
      expect(task.description).toBeNull();
      expect(task.repeat).toBe("none");
    });

    test("should create a task with default repeat value", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);

      const task = createTask({
        chatId: testChatId,
        title: "No repeat task",
        dueTime,
      });

      expect(task.repeat).toBe("none");
    });
  });

  describe("getTasks", () => {
    test("should return empty array when no tasks exist", () => {
      const tasks = getTasks(99999);
      expect(tasks).toEqual([]);
    });

    test("should return all tasks for a chat", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);

      createTask({ chatId: testChatId, title: "Task 1", dueTime });
      createTask({ chatId: testChatId, title: "Task 2", dueTime });
      createTask({ chatId: testChatId, title: "Task 3", dueTime });

      const tasks = getTasks(testChatId);
      expect(tasks.length).toBe(3);
    });

    test("should not return tasks from other chats", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const otherChatId = testChatId + 1;

      createTask({ chatId: testChatId, title: "My Task", dueTime });
      createTask({ chatId: otherChatId, title: "Other Task", dueTime });

      const tasks = getTasks(testChatId);
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.title).toBe("My Task");
    });
  });

  describe("getTaskById", () => {
    test("should return task by id", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const created = createTask({ chatId: testChatId, title: "Find Me", dueTime });

      const found = getTaskById(created.id, testChatId);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe("Find Me");
    });

    test("should return null for non-existent task", () => {
      const found = getTaskById(99999, testChatId);
      expect(found).toBeNull();
    });

    test("should return null for task from different chat", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const otherChatId = testChatId + 1;
      const created = createTask({ chatId: otherChatId, title: "Other Task", dueTime });

      const found = getTaskById(created.id, testChatId);
      expect(found).toBeNull();
    });
  });

  describe("updateTask", () => {
    test("should update task title", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Original", dueTime });

      const updated = updateTask(task.id, testChatId, { title: "Updated" });
      expect(updated).toBeDefined();
      expect(updated!.title).toBe("Updated");
    });

    test("should update task description", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Task", dueTime });

      const updated = updateTask(task.id, testChatId, { description: "New desc" });
      expect(updated!.description).toBe("New desc");
    });

    test("should update task completed status", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Task", dueTime });
      expect(task.completed).toBe(false);

      const updated = updateTask(task.id, testChatId, { completed: true });
      expect(updated!.completed).toBe(true);
    });

    test("should update task reminded status", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Task", dueTime });
      expect(task.reminded).toBe(false);

      const updated = updateTask(task.id, testChatId, { reminded: true });
      expect(updated!.reminded).toBe(true);
    });

    test("should update task repeat type", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Task", dueTime });

      const updated = updateTask(task.id, testChatId, { repeat: "weekly" });
      expect(updated!.repeat).toBe("weekly");
    });

    test("should update task due time", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Task", dueTime });

      const newTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const updated = updateTask(task.id, testChatId, { dueTime: newTime });
      expect(new Date(updated!.dueTime).getTime()).toBe(newTime.getTime());
    });

    test("should return null for non-existent task", () => {
      const updated = updateTask(99999, testChatId, { title: "New" });
      expect(updated).toBeNull();
    });

    test("should return original task when no updates provided", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Task", dueTime });

      const updated = updateTask(task.id, testChatId, {});
      expect(updated!.title).toBe("Task");
    });
  });

  describe("deleteTask", () => {
    test("should delete existing task", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Delete Me", dueTime });

      const deleted = deleteTask(task.id, testChatId);
      expect(deleted).toBe(true);

      const found = getTaskById(task.id, testChatId);
      expect(found).toBeNull();
    });

    test("should return false for non-existent task", () => {
      const deleted = deleteTask(99999, testChatId);
      expect(deleted).toBe(false);
    });

    test("should not delete task from different chat", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const otherChatId = testChatId + 1;
      const task = createTask({ chatId: otherChatId, title: "Other Task", dueTime });

      const deleted = deleteTask(task.id, testChatId);
      expect(deleted).toBe(false);

      const found = getTaskById(task.id, otherChatId);
      expect(found).not.toBeNull();
    });
  });

  describe("rescheduleRepeatingTask", () => {
    test("should reschedule daily task to next day", () => {
      const dueTime = new Date("2026-02-01T10:00:00Z");
      const task = createTask({
        chatId: testChatId,
        title: "Daily Task",
        dueTime,
        repeat: "daily",
      });

      const rescheduled = rescheduleRepeatingTask(task);
      expect(rescheduled).toBeDefined();

      const nextDate = new Date(rescheduled!.dueTime);
      expect(nextDate.getTime()).toBe(new Date("2026-02-02T10:00:00Z").getTime());
      expect(rescheduled!.completed).toBe(false);
      expect(rescheduled!.reminded).toBe(false);
    });

    test("should reschedule weekly task to next week", () => {
      const dueTime = new Date("2026-02-01T10:00:00Z");
      const task = createTask({
        chatId: testChatId,
        title: "Weekly Task",
        dueTime,
        repeat: "weekly",
      });

      const rescheduled = rescheduleRepeatingTask(task);
      const nextDate = new Date(rescheduled!.dueTime);
      expect(nextDate.getTime()).toBe(new Date("2026-02-08T10:00:00Z").getTime());
    });

    test("should reschedule monthly task to next month", () => {
      const dueTime = new Date("2026-02-01T10:00:00Z");
      const task = createTask({
        chatId: testChatId,
        title: "Monthly Task",
        dueTime,
        repeat: "monthly",
      });

      const rescheduled = rescheduleRepeatingTask(task);
      const nextDate = new Date(rescheduled!.dueTime);
      expect(nextDate.getMonth()).toBe(2); // March (0-indexed)
    });

    test("should return null for non-repeating task", () => {
      const dueTime = new Date("2026-02-01T10:00:00Z");
      const task = createTask({
        chatId: testChatId,
        title: "One Time Task",
        dueTime,
        repeat: "none",
      });

      const rescheduled = rescheduleRepeatingTask(task);
      expect(rescheduled).toBeNull();
    });
  });

  describe("getDueTasks", () => {
    test("should return tasks that are due and not reminded", () => {
      const pastTime = new Date(Date.now() - 60 * 1000);
      createTask({ chatId: testChatId, title: "Due Task", dueTime: pastTime });

      const dueTasks = getDueTasks();
      expect(dueTasks.length).toBeGreaterThanOrEqual(1);
      expect(dueTasks.some(t => t.title === "Due Task")).toBe(true);
    });

    test("should not return tasks that are already reminded", () => {
      const pastTime = new Date(Date.now() - 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Reminded Task", dueTime: pastTime });
      updateTask(task.id, testChatId, { reminded: true });

      const dueTasks = getDueTasks();
      expect(dueTasks.some(t => t.title === "Reminded Task")).toBe(false);
    });

    test("should not return completed tasks", () => {
      const pastTime = new Date(Date.now() - 60 * 1000);
      const task = createTask({ chatId: testChatId, title: "Completed Task", dueTime: pastTime });
      updateTask(task.id, testChatId, { completed: true });

      const dueTasks = getDueTasks();
      expect(dueTasks.some(t => t.title === "Completed Task")).toBe(false);
    });

    test("should not return future tasks", () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000);
      createTask({ chatId: testChatId, title: "Future Task", dueTime: futureTime });

      const dueTasks = getDueTasks();
      expect(dueTasks.some(t => t.title === "Future Task")).toBe(false);
    });
  });
});
