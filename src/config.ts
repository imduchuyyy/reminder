const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN environment variable is required!");
  console.error("   Get your token from @BotFather on Telegram");
  process.exit(1);
}

// Parse allowed usernames (comma-separated)
const ALLOWED_USERS = process.env.ALLOWED_USERS
  ? process.env.ALLOWED_USERS.split(",").map(u => u.trim().toLowerCase().replace(/^@/, ""))
  : [];

// Timezone configuration (default: UTC+7 / Asia/Bangkok)
const TIMEZONE = process.env.TZ || "Asia/Bangkok";

export const config = {
  botToken: BOT_TOKEN,
  dbPath: process.env.DB_PATH || "./reminder.db",
  allowedUsers: ALLOWED_USERS,
  timezone: TIMEZONE,
} as const;

// Helper to format date in configured timezone
export function formatDateInTimezone(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: config.timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
