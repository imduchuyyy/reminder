import { startBot } from "./src/bot";

startBot().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});