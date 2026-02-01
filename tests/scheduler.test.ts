// Import setup FIRST to configure environment
import "./setup";

import { describe, test, expect } from "bun:test";
import { handleTaskDone, handleSnooze } from "../src/scheduler";
import { createTask, getTaskById, updateTask } from "../src/db";

describe("Scheduler Helpers", () => {
  const testChatId = 54321;

  describe("handleTaskDone", () => {
    test("should mark task as completed", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({
        chatId: testChatId,
        title: "Complete Me",
        dueTime,
      });

      const result = handleTaskDone(task.id, testChatId);
      expect(result).toContain("Complete Me");
      expect(result).toContain("completed");

      const updated = getTaskById(task.id, testChatId);
      expect(updated!.completed).toBe(true);
    });

    test("should reschedule repeating task", () => {
      const dueTime = new Date(Date.now() + 60 * 60 * 1000);
      const task = createTask({
        chatId: testChatId,
        title: "Daily Task",
        dueTime,
        repeat: "daily",
      });

      const result = handleTaskDone(task.id, testChatId);
      expect(result).toContain("Next occurrence");
      expect(result).toContain("Daily Task");
    });

    test("should return error for non-existent task", () => {
      const result = handleTaskDone(99999, testChatId);
      expect(result).toContain("not found");
    });
  });

  describe("handleSnooze", () => {
    test("should snooze task by specified minutes", () => {
      const dueTime = new Date(Date.now() - 60 * 1000);
      const task = createTask({
        chatId: testChatId,
        title: "Snooze Me",
        dueTime,
      });
      updateTask(task.id, testChatId, { reminded: true });

      const result = handleSnooze(task.id, testChatId, 10);
      expect(result).toContain("snoozed");
      expect(result).toContain("Snooze Me");

      const updated = getTaskById(task.id, testChatId);
      expect(updated!.reminded).toBe(false);

      const newDueTime = new Date(updated!.dueTime);
      const expectedTime = Date.now() + 10 * 60 * 1000;
      expect(Math.abs(newDueTime.getTime() - expectedTime)).toBeLessThan(5000);
    });

    test("should return error for non-existent task", () => {
      const result = handleSnooze(99999, testChatId, 10);
      expect(result).toContain("not found");
    });
  });
});
