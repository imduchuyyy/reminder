import { describe, test, expect } from "bun:test";

// Helper to parse time input - extracted for testing
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

describe("Time Parsing", () => {
  describe("Relative time formats", () => {
    test("should parse minutes only (30m)", () => {
      const result = parseTimeInput("30m");
      expect(result).not.toBeNull();

      const expectedMs = Date.now() + 30 * 60 * 1000;
      expect(Math.abs(result!.getTime() - expectedMs)).toBeLessThan(1000);
    });

    test("should parse hours only (2h)", () => {
      const result = parseTimeInput("2h");
      expect(result).not.toBeNull();

      const expectedMs = Date.now() + 2 * 60 * 60 * 1000;
      expect(Math.abs(result!.getTime() - expectedMs)).toBeLessThan(1000);
    });

    test("should parse hours and minutes (1h30m)", () => {
      const result = parseTimeInput("1h30m");
      expect(result).not.toBeNull();

      const expectedMs = Date.now() + (1 * 60 + 30) * 60 * 1000;
      expect(Math.abs(result!.getTime() - expectedMs)).toBeLessThan(1000);
    });

    test("should parse 10m", () => {
      const result = parseTimeInput("10m");
      expect(result).not.toBeNull();

      const expectedMs = Date.now() + 10 * 60 * 1000;
      expect(Math.abs(result!.getTime() - expectedMs)).toBeLessThan(1000);
    });
  });

  describe("Time-of-day formats", () => {
    test("should parse 24-hour time (14:30)", () => {
      const result = parseTimeInput("14:30");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    test("should parse 12-hour time with AM (9:00am)", () => {
      const result = parseTimeInput("9:00am");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    test("should parse 12-hour time with PM (3:30pm)", () => {
      const result = parseTimeInput("3:30pm");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(15);
      expect(result!.getMinutes()).toBe(30);
    });

    test("should parse 12:00am as midnight", () => {
      const result = parseTimeInput("12:00am");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(0);
    });

    test("should parse 12:00pm as noon", () => {
      const result = parseTimeInput("12:00pm");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(12);
    });

    test("should handle uppercase AM/PM", () => {
      const result = parseTimeInput("9:00AM");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
    });
  });

  describe("Full date-time formats", () => {
    test("should parse YYYY-MM-DD HH:MM format", () => {
      const result = parseTimeInput("2026-02-15 14:30");
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(1); // February (0-indexed)
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    test("should parse single-digit hours", () => {
      const result = parseTimeInput("2026-03-01 9:00");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
    });
  });

  describe("Invalid formats", () => {
    test("should return null for empty string", () => {
      const result = parseTimeInput("");
      expect(result).toBeNull();
    });

    test("should return null for invalid format", () => {
      const result = parseTimeInput("tomorrow");
      expect(result).toBeNull();
    });

    test("should return null for random text", () => {
      const result = parseTimeInput("hello world");
      expect(result).toBeNull();
    });
  });

  describe("ISO string fallback", () => {
    test("should parse ISO date string", () => {
      const result = parseTimeInput("2026-02-01T14:30:00");
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
    });
  });
});
