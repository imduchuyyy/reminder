import type { Bot, Context } from "grammy";
import type { Task } from "./types";
import { getDueTasks, updateTask, rescheduleRepeatingTask } from "./db";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function formatTaskReminder(task: Task): string {
  const lines = [`🔔 **Reminder!**`, ``, `📌 **${task.title}**`];

  if (task.description) {
    lines.push(`📝 ${task.description}`);
  }

  const dueDate = new Date(task.dueTime);
  lines.push(`⏰ ${dueDate.toLocaleString()}`);

  if (task.repeat !== "none") {
    lines.push(`🔄 Repeats: ${task.repeat}`);
  }

  return lines.join("\n");
}

async function checkAndSendReminders(bot: Bot<Context>): Promise<void> {
  try {
    const dueTasks = getDueTasks();

    for (const task of dueTasks) {
      try {
        await bot.api.sendMessage(task.chatId, formatTaskReminder(task), {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Done", callback_data: `done:${task.id}` },
                { text: "⏰ Snooze 10m", callback_data: `snooze:${task.id}:10` },
              ],
              [
                { text: "⏰ Snooze 1h", callback_data: `snooze:${task.id}:60` },
              ],
            ],
          },
        });

        // Mark as reminded so we don't send again
        updateTask(task.id, task.chatId, { reminded: true });
        console.log(`📤 Sent reminder for task ${task.id}: ${task.title}`);
      } catch (error) {
        console.error(`Failed to send reminder for task ${task.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Error checking reminders:", error);
  }
}

export function startScheduler<C extends Context>(bot: Bot<C>): void {
  if (schedulerInterval) {
    console.log("Scheduler already running");
    return;
  }

  console.log("🕐 Starting reminder scheduler (checking every minute)...");

  // Check immediately on start
  checkAndSendReminders(bot as unknown as Bot<Context>);

  // Then check every minute
  schedulerInterval = setInterval(() => {
    checkAndSendReminders(bot as unknown as Bot<Context>);
  }, 60 * 1000);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("🛑 Scheduler stopped");
  }
}

export function handleTaskDone(taskId: number, chatId: number): string {
  const task = updateTask(taskId, chatId, { completed: true });

  if (!task) {
    return "❌ Task not found";
  }

  if (task.repeat !== "none") {
    const rescheduled = rescheduleRepeatingTask(task);
    if (rescheduled) {
      const nextDate = new Date(rescheduled.dueTime);
      return `✅ Task "${task.title}" completed!\n\n🔄 Next occurrence: ${nextDate.toLocaleString()}`;
    }
  }

  return `✅ Task "${task.title}" completed! Great job! 🎉`;
}

export function handleSnooze(taskId: number, chatId: number, minutes: number): string {
  const newTime = new Date(Date.now() + minutes * 60 * 1000);
  const task = updateTask(taskId, chatId, {
    dueTime: newTime,
    reminded: false
  });

  if (!task) {
    return "❌ Task not found";
  }

  return `⏰ Task "${task.title}" snoozed until ${newTime.toLocaleString()}`;
}
