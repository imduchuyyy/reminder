const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN environment variable is required!");
  console.error("   Get your token from @BotFather on Telegram");
  process.exit(1);
}

export const config = {
  botToken: BOT_TOKEN,
  dbPath: process.env.DB_PATH || "./reminder.db",
} as const;
