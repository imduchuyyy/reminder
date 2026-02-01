import { Bot, Context, session, InlineKeyboard } from "grammy";
import { config, formatDateInTimezone } from "./config";
import { createTask, getTasks, getTaskById, updateTask, deleteTask, getTodayTasks } from "./db";
import { startScheduler, handleTaskDone, handleSnooze } from "./scheduler";
import type { RepeatType, Task } from "./types";

// Session data for multi-step interactions
interface SessionData {
  state?: "idle" | "add_title" | "add_desc" | "add_time" | "edit_field";
  taskData?: {
    title?: string;
    description?: string;
  };
  editingTaskId?: number;
  editField?: string;
}

type MyContext = Context & { session: SessionData };

// Create bot
const bot = new Bot<MyContext>(config.botToken);

// Install session middleware
bot.use(session({ initial: (): SessionData => ({ state: "idle" }) }));

// User whitelist middleware - only allow specified users
bot.use(async (ctx, next) => {
  // If no allowed users configured, allow everyone
  if (config.allowedUsers.length === 0) {
    return next();
  }

  const username = ctx.from?.username?.toLowerCase();

  if (!username || !config.allowedUsers.includes(username)) {
    // Silently ignore unauthorized users
    console.log(`⛔ Unauthorized access attempt from: ${username || "unknown"}`);
    return;
  }

  return next();
});

// Helper to format task for display
function formatTask(task: Task): string {
  const status = task.completed ? "✅" : "⏳";
  const lines = [`${status} **#${task.id}** ${task.title}`];

  if (task.description) {
    lines.push(`   📝 ${task.description}`);
  }

  const dueDate = new Date(task.dueTime);
  lines.push(`   ⏰ ${formatDateInTimezone(dueDate)}`);

  if (task.repeat !== "none") {
    lines.push(`   🔄 ${task.repeat}`);
  }

  return lines.join("\n");
}

// Helper to parse time input
function parseTimeInput(input: string): Date | null {
  const now = new Date();

  // Handle relative time like "10m", "1h", "2h30m"
  const relativeMatch = input.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (relativeMatch && (relativeMatch[1] || relativeMatch[2])) {
    const hours = parseInt(relativeMatch[1] || "0");
    const minutes = parseInt(relativeMatch[2] || "0");
    return new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
  }

  // Handle time today like "14:30" or "2:30pm"
  const timeMatch = input.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]!);
    const minutes = parseInt(timeMatch[2]!);
    const period = timeMatch[3]?.toLowerCase();

    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (date <= now) {
      date.setDate(date.getDate() + 1);
    }

    return date;
  }

  // Handle full date/time like "2026-02-01 14:30"
  const fullMatch = input.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    const [, dateStr, hourStr, minStr] = fullMatch;
    const date = new Date(`${dateStr}T${hourStr!.padStart(2, "0")}:${minStr}:00`);
    if (!isNaN(date.getTime())) return date;
  }

  // Try native Date parsing as fallback
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

// Commands
bot.command("start", async (ctx) => {
  ctx.session.state = "idle";
  await ctx.reply(
    "👋 **Welcome to Todo Reminder Bot!**\n\n" +
    "I'll help you manage your tasks and remind you when they're due.\n\n" +
    "**Commands:**\n" +
    "📝 /add - Add a new task\n" +
    "📋 /list - View all tasks\n" +
    "📅 /today - View today's tasks\n" +
    "✏️ /edit - Edit a task\n" +
    "🗑️ /remove - Remove a task\n" +
    "❓ /help - Show this help\n\n" +
    "Let's get started! Use /add to create your first task.",
    { parse_mode: "Markdown" }
  );
});

bot.command("help", async (ctx) => {
  ctx.session.state = "idle";
  await ctx.reply(
    "**📚 Todo Reminder Bot Help**\n\n" +
    "**Commands:**\n" +
    "• `/add` - Create a new task\n" +
    "• `/list` - View all your tasks\n" +
    "• `/today` - View tasks due today\n" +
    "• `/edit` - Edit an existing task\n" +
    "• `/remove <id>` - Remove a task by ID\n" +
    "• `/cancel` - Cancel current action\n\n" +
    "**Time Formats:**\n" +
    "• `30m` - 30 minutes from now\n" +
    "• `2h` - 2 hours from now\n" +
    "• `1h30m` - 1.5 hours from now\n" +
    "• `14:30` - at 2:30 PM today\n" +
    "• `9:00am` - at 9 AM\n" +
    "• `2026-02-01 14:30` - specific date\n\n" +
    "**Repeat Options:**\n" +
    "• None - one-time task\n" +
    "• Daily - repeats every day\n" +
    "• Weekly - repeats every week\n" +
    "• Monthly - repeats every month",
    { parse_mode: "Markdown" }
  );
});

bot.command("cancel", async (ctx) => {
  ctx.session.state = "idle";
  ctx.session.taskData = undefined;
  ctx.session.editingTaskId = undefined;
  await ctx.reply("❌ Cancelled. What would you like to do?");
});

bot.command("add", async (ctx) => {
  ctx.session.state = "add_title";
  ctx.session.taskData = {};
  await ctx.reply(
    "📝 **Let's add a new task!**\n\n" +
    "What's the task title?\n\n" +
    "_Send /cancel to abort_",
    { parse_mode: "Markdown" }
  );
});

bot.command("edit", async (ctx) => {
  const chatId = ctx.chat.id;
  const tasks = getTasks(chatId).filter(t => !t.completed);

  if (tasks.length === 0) {
    await ctx.reply("📭 No tasks to edit. Add one with /add");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const task of tasks.slice(0, 10)) {
    keyboard.text(`#${task.id} ${task.title.slice(0, 25)}`, `select_edit:${task.id}`).row();
  }
  keyboard.text("❌ Cancel", "select_edit:cancel");

  ctx.session.state = "idle";
  await ctx.reply("✏️ **Which task do you want to edit?**", {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
});

bot.command("list", async (ctx) => {
  ctx.session.state = "idle";
  const tasks = getTasks(ctx.chat.id);

  if (tasks.length === 0) {
    await ctx.reply("📭 No tasks yet! Add one with /add");
    return;
  }

  const pending = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed).slice(-5);

  let message = "📋 **Your Tasks**\n\n";

  if (pending.length > 0) {
    message += "**Pending:**\n";
    message += pending.map(t => formatTask(t)).join("\n\n");
  }

  if (completed.length > 0) {
    message += "\n\n**Recently Completed:**\n";
    message += completed.map(t => formatTask(t)).join("\n\n");
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
});

bot.command("today", async (ctx) => {
  ctx.session.state = "idle";
  const tasks = getTodayTasks(ctx.chat.id);

  if (tasks.length === 0) {
    await ctx.reply("📅 No tasks scheduled for today! 🎉");
    return;
  }

  const message = "📅 **Today's Tasks**\n\n" + tasks.map(t => formatTask(t)).join("\n\n");
  await ctx.reply(message, { parse_mode: "Markdown" });
});

bot.command("remove", async (ctx) => {
  ctx.session.state = "idle";
  const text = ctx.message?.text || "";
  const match = text.match(/\/remove\s+(\d+)/);

  if (!match) {
    const tasks = getTasks(ctx.chat.id).filter(t => !t.completed);

    if (tasks.length === 0) {
      await ctx.reply("📭 No tasks to remove");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const task of tasks.slice(0, 10)) {
      keyboard.text(`🗑️ #${task.id} ${task.title.slice(0, 20)}`, `remove:${task.id}`).row();
    }

    await ctx.reply("🗑️ **Select a task to remove:**", {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    return;
  }

  const taskId = parseInt(match[1]!);
  const deleted = deleteTask(taskId, ctx.chat.id);

  if (deleted) {
    await ctx.reply(`✅ Task #${taskId} deleted`);
  } else {
    await ctx.reply(`❌ Task #${taskId} not found`);
  }
});

// Handle text messages for multi-step input
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;

  // Skip if it's a command
  if (text.startsWith("/")) return;

  const state = ctx.session.state || "idle";

  if (state === "add_title") {
    ctx.session.taskData = { title: text };
    ctx.session.state = "add_desc";
    await ctx.reply(
      "📄 Add a description (or send `-` to skip):",
      { parse_mode: "Markdown" }
    );
  } else if (state === "add_desc") {
    const description = text === "-" ? undefined : text;
    if (ctx.session.taskData) {
      ctx.session.taskData.description = description;
    }
    ctx.session.state = "add_time";
    await ctx.reply(
      "⏰ **When should I remind you?**\n\n" +
      "Examples:\n" +
      "• `30m` - in 30 minutes\n" +
      "• `2h` - in 2 hours\n" +
      "• `1h30m` - in 1.5 hours\n" +
      "• `14:30` - at 2:30 PM today\n" +
      "• `9:00am` - at 9 AM\n" +
      "• `2026-02-01 14:30` - specific date/time",
      { parse_mode: "Markdown" }
    );
  } else if (state === "add_time") {
    const dueTime = parseTimeInput(text);
    if (!dueTime) {
      await ctx.reply("❌ Invalid time format. Please try again:");
      return;
    }

    // Show repeat options
    ctx.session.state = "idle"; // Will wait for callback
    await ctx.reply(
      "🔄 **Should this task repeat?**",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "No repeat", callback_data: `create:none:${dueTime.toISOString()}` },
              { text: "Daily", callback_data: `create:daily:${dueTime.toISOString()}` },
            ],
            [
              { text: "Weekly", callback_data: `create:weekly:${dueTime.toISOString()}` },
              { text: "Monthly", callback_data: `create:monthly:${dueTime.toISOString()}` },
            ],
          ],
        },
      }
    );
  } else if (state === "edit_field") {
    const taskId = ctx.session.editingTaskId;
    const field = ctx.session.editField;

    if (!taskId || !field) {
      ctx.session.state = "idle";
      await ctx.reply("❌ Something went wrong. Try /edit again.");
      return;
    }

    if (field === "title") {
      updateTask(taskId, chatId, { title: text });
      await ctx.reply(`✅ Title updated to: ${text}`);
    } else if (field === "description") {
      updateTask(taskId, chatId, { description: text === "-" ? "" : text });
      await ctx.reply("✅ Description updated!");
    } else if (field === "time") {
      const newTime = parseTimeInput(text);
      if (newTime) {
        updateTask(taskId, chatId, { dueTime: newTime, reminded: false });
        await ctx.reply(`✅ Time updated to: ${formatDateInTimezone(newTime)}`);
      } else {
        await ctx.reply("❌ Invalid time format. Edit cancelled.");
      }
    }

    ctx.session.state = "idle";
    ctx.session.editingTaskId = undefined;
    ctx.session.editField = undefined;
  }
});

// Handle callback queries (button presses)
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id;

  if (!chatId) return;

  // Handle task creation with repeat selection
  if (data.startsWith("create:")) {
    // Parse carefully since ISO date contains colons
    // Format: create:repeat:isoTime
    const firstColon = data.indexOf(":");
    const secondColon = data.indexOf(":", firstColon + 1);
    const repeat = data.slice(firstColon + 1, secondColon);
    const isoTime = data.slice(secondColon + 1);
    const dueTime = new Date(isoTime);

    const task = createTask({
      chatId,
      title: ctx.session.taskData?.title || "Untitled",
      description: ctx.session.taskData?.description,
      dueTime,
      repeat: (repeat as RepeatType) || "none",
    });

    ctx.session.taskData = undefined;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `✅ **Task created!**\n\n${formatTask(task)}\n\nI'll remind you at ${formatDateInTimezone(dueTime)}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Handle done button
  if (data.startsWith("done:")) {
    const taskId = parseInt(data.split(":")[1]!);
    const result = handleTaskDone(taskId, chatId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(result, { parse_mode: "Markdown" });
    return;
  }

  // Handle snooze button
  if (data.startsWith("snooze:")) {
    const [, taskIdStr, minutesStr] = data.split(":");
    const taskId = parseInt(taskIdStr!);
    const minutes = parseInt(minutesStr!);
    const result = handleSnooze(taskId, chatId, minutes);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(result, { parse_mode: "Markdown" });
    return;
  }

  // Handle remove button
  if (data.startsWith("remove:")) {
    const taskId = parseInt(data.split(":")[1]!);
    const deleted = deleteTask(taskId, chatId);
    await ctx.answerCallbackQuery();
    if (deleted) {
      await ctx.editMessageText(`✅ Task #${taskId} deleted`);
    } else {
      await ctx.editMessageText(`❌ Task #${taskId} not found`);
    }
    return;
  }

  // Handle task selection for editing
  if (data.startsWith("select_edit:")) {
    const value = data.split(":")[1];
    await ctx.answerCallbackQuery();

    if (value === "cancel") {
      await ctx.editMessageText("❌ Cancelled");
      return;
    }

    const taskId = parseInt(value!);
    const task = getTaskById(taskId, chatId);

    if (!task) {
      await ctx.editMessageText("❌ Task not found");
      return;
    }

    ctx.session.editingTaskId = taskId;

    await ctx.editMessageText(
      `📝 **Editing: ${task.title}**\n\nWhat would you like to change?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📌 Title", callback_data: "edit_field:title" },
              { text: "📝 Description", callback_data: "edit_field:description" },
            ],
            [
              { text: "⏰ Time", callback_data: "edit_field:time" },
              { text: "🔄 Repeat", callback_data: "edit_field:repeat" },
            ],
            [{ text: "❌ Cancel", callback_data: "edit_field:cancel" }],
          ],
        },
      }
    );
    return;
  }

  // Handle edit field selection
  if (data.startsWith("edit_field:")) {
    const field = data.split(":")[1];
    await ctx.answerCallbackQuery();

    if (field === "cancel") {
      ctx.session.editingTaskId = undefined;
      await ctx.editMessageText("❌ Cancelled");
      return;
    }

    const taskId = ctx.session.editingTaskId;
    if (!taskId) {
      await ctx.editMessageText("❌ Error: No task selected");
      return;
    }

    if (field === "title") {
      ctx.session.state = "edit_field";
      ctx.session.editField = "title";
      await ctx.editMessageText("Enter new title:");
    } else if (field === "description") {
      ctx.session.state = "edit_field";
      ctx.session.editField = "description";
      await ctx.editMessageText("Enter new description (or `-` to remove):");
    } else if (field === "time") {
      ctx.session.state = "edit_field";
      ctx.session.editField = "time";
      await ctx.editMessageText("Enter new time (`30m`, `14:30`, `2026-02-01 14:30`):", { parse_mode: "Markdown" });
    } else if (field === "repeat") {
      await ctx.editMessageText("Select repeat option:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "No repeat", callback_data: "set_repeat:none" },
              { text: "Daily", callback_data: "set_repeat:daily" },
            ],
            [
              { text: "Weekly", callback_data: "set_repeat:weekly" },
              { text: "Monthly", callback_data: "set_repeat:monthly" },
            ],
          ],
        },
      });
    }
    return;
  }

  // Handle repeat setting
  if (data.startsWith("set_repeat:")) {
    const repeat = data.split(":")[1] as RepeatType;
    const taskId = ctx.session.editingTaskId;

    await ctx.answerCallbackQuery();

    if (!taskId) {
      await ctx.editMessageText("❌ Error: No task selected");
      return;
    }

    updateTask(taskId, chatId, { repeat });
    ctx.session.editingTaskId = undefined;
    await ctx.editMessageText(`✅ Repeat updated to: ${repeat}`);
    return;
  }

  await ctx.answerCallbackQuery();
});

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

// Start the bot
export async function startBot(): Promise<void> {
  console.log("🤖 Starting Todo Reminder Bot...");

  // Start the scheduler
  startScheduler(bot);

  // Start polling
  await bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot started as @${botInfo.username}`);
    },
  });
}

export { bot };
