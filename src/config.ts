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

export const config = {
  botToken: BOT_TOKEN,
  dbPath: process.env.DB_PATH || "./reminder.db",
  allowedUsers: ALLOWED_USERS,
} as const;
