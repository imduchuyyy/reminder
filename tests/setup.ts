// Test setup - ensures environment is configured before any imports
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "./test-reminder.db";

// Clean up any existing test database
export function cleanupTestDb() {
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore
    }
  }
}

// Set up environment before other imports
export function setupTestEnv() {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.DB_PATH = TEST_DB_PATH;
}

// Initialize immediately when this module is loaded
cleanupTestDb();
setupTestEnv();

export { TEST_DB_PATH };
