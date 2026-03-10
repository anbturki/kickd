type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

class Logger {
  private minLevel: number;
  private logFile: string | null;
  private jsonMode: boolean;

  constructor() {
    const level = (process.env.KICKD_LOG_LEVEL ?? "info") as LogLevel;
    this.minLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    this.logFile = process.env.KICKD_LOG_FILE ?? null;
    this.jsonMode = process.env.KICKD_LOG_FORMAT === "json";
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private format(entry: LogEntry): string {
    if (this.jsonMode) {
      return JSON.stringify(entry);
    }

    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase().padEnd(5)}] [${entry.module}]`;
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    return `${prefix} ${entry.message}${data}`;
  }

  private async write(entry: LogEntry) {
    const line = this.format(entry);

    switch (entry.level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      default:
        console.log(line);
    }

    if (this.logFile) {
      try {
        await Bun.write(
          Bun.file(this.logFile),
          line + "\n"
        );
      } catch {
        // Fallback: append mode
        const file = Bun.file(this.logFile);
        const existing = await file.exists() ? await file.text() : "";
        await Bun.write(file, existing + line + "\n");
      }
    }
  }

  private log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    this.write(entry);
  }

  child(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  _log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
    this.log(level, module, message, data);
  }
}

class ModuleLogger {
  constructor(private parent: Logger, private module: string) {}

  debug(message: string, data?: Record<string, unknown>) {
    this.parent._log("debug", this.module, message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.parent._log("info", this.module, message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.parent._log("warn", this.module, message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.parent._log("error", this.module, message, data);
  }
}

export const logger = new Logger();
export type { ModuleLogger, LogLevel, LogEntry };
