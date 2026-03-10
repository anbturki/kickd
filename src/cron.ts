interface CronField {
  type: "wildcard" | "values";
  values: number[];
}

interface CronSchedule {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

const DAY_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const FIELD_RANGES: Array<{ min: number; max: number }> = [
  { min: 0, max: 59 },   // minute
  { min: 0, max: 23 },   // hour
  { min: 1, max: 31 },   // day of month
  { min: 1, max: 12 },   // month
  { min: 0, max: 6 },    // day of week
];

function replaceNames(field: string, names: Record<string, number>): string {
  let result = field.toUpperCase();
  for (const [name, value] of Object.entries(names)) {
    result = result.replace(new RegExp(name, "g"), String(value));
  }
  return result;
}

function parseField(raw: string, range: { min: number; max: number }, fieldIndex: number): CronField {
  let field = raw;

  // Replace named values
  if (fieldIndex === 4) field = replaceNames(field, DAY_NAMES);
  if (fieldIndex === 3) field = replaceNames(field, MONTH_NAMES);

  if (field === "*") {
    return { type: "wildcard", values: [] };
  }

  const values = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[2]);
      let start = range.min;
      let end = range.max;

      if (stepMatch[1] !== "*") {
        const [s, e] = stepMatch[1]!.split("-").map(Number);
        start = s!;
        end = e!;
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
      continue;
    }

    const num = Number(part);
    if (!isNaN(num) && num >= range.min && num <= range.max) {
      values.add(num);
    }
  }

  return { type: "values", values: Array.from(values).sort((a, b) => a - b) };
}

export function parseCron(expression: string): CronSchedule {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  return {
    minute: parseField(parts[0]!, FIELD_RANGES[0]!, 0),
    hour: parseField(parts[1]!, FIELD_RANGES[1]!, 1),
    dayOfMonth: parseField(parts[2]!, FIELD_RANGES[2]!, 2),
    month: parseField(parts[3]!, FIELD_RANGES[3]!, 3),
    dayOfWeek: parseField(parts[4]!, FIELD_RANGES[4]!, 4),
  };
}

function fieldMatches(field: CronField, value: number): boolean {
  if (field.type === "wildcard") return true;
  return field.values.includes(value);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function nextOccurrence(schedule: CronSchedule, after?: Date): Date {
  const start = after ?? new Date();
  const cursor = new Date(start);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const maxIterations = 525960; // ~1 year of minutes
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const month = cursor.getMonth() + 1;
    if (!fieldMatches(schedule.month, month)) {
      // Advance to next month
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const day = cursor.getDate();
    const dow = cursor.getDay();
    const maxDay = daysInMonth(cursor.getFullYear(), month);

    if (day > maxDay) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (!fieldMatches(schedule.dayOfMonth, day) || !fieldMatches(schedule.dayOfWeek, dow)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const hour = cursor.getHours();
    if (!fieldMatches(schedule.hour, hour)) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }

    const minute = cursor.getMinutes();
    if (!fieldMatches(schedule.minute, minute)) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      continue;
    }

    return new Date(cursor);
  }

  throw new Error("Could not find next occurrence within 1 year");
}

// Detect if a schedule string is a cron expression (5 space-separated fields)
export function isCronExpression(schedule: string): boolean {
  return /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(schedule.trim());
}
