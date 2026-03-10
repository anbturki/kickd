import { registry } from "./tasks/registry";
import { logger } from "./logger";

const log = logger.child("lifecycle");

let isShuttingDown = false;

export function initGracefulShutdown() {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info(`Received ${signal}, shutting down gracefully...`);

    // Stop all scheduled tasks
    registry.stopAll();
    log.info("Stopped all scheduled tasks");

    // Give in-flight requests a moment to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("uncaughtException", (err) => {
    log.error("Uncaught exception", { error: err.message, stack: err.stack });
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    log.error("Unhandled rejection", { error: message });
  });
}

export function isShutdown(): boolean {
  return isShuttingDown;
}
