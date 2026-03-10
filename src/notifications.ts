import { getActiveChannels } from "./db";
import { eventBus, type KickdEvent } from "./events";
import { createHmac } from "crypto";

interface NotificationPayload {
  event: string;
  sourceType: string;
  sourceId: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

async function sendSlack(url: string, payload: NotificationPayload) {
  const emoji = payload.event.includes("failure") ? "x" : payload.event.includes("retry") ? "warning" : "white_check_mark";
  const body = {
    text: `[kickd] ${payload.event}: ${payload.message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:${emoji}: *${payload.event}*\n${payload.message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Source: \`${payload.sourceType}/${payload.sourceId}\` | ${payload.timestamp}`,
          },
        ],
      },
    ],
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendDiscord(url: string, payload: NotificationPayload) {
  const color = payload.event.includes("failure") ? 0xff0000 : payload.event.includes("retry") ? 0xffaa00 : 0x00ff00;
  const body = {
    embeds: [
      {
        title: `[kickd] ${payload.event}`,
        description: payload.message,
        color,
        fields: [
          { name: "Source", value: `${payload.sourceType}/${payload.sourceId}`, inline: true },
          { name: "Time", value: payload.timestamp, inline: true },
        ],
      },
    ],
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendWebhook(url: string, payload: NotificationPayload, secret?: string) {
  const bodyStr = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (secret) {
    const signature = createHmac("sha256", secret).update(bodyStr).digest("hex");
    headers["X-Kickd-Signature"] = signature;
  }

  await fetch(url, { method: "POST", headers, body: bodyStr });
}

export async function notify(event: string, sourceType: string, sourceId: string, message: string, details?: Record<string, unknown>) {
  const channels = getActiveChannels();
  const payload: NotificationPayload = {
    event,
    sourceType,
    sourceId,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  for (const channel of channels) {
    const subscribedEvents: string[] = JSON.parse(channel.events);

    // Check if this channel subscribes to this event (exact match or wildcard)
    const matches = subscribedEvents.some(
      (e) => e === event || e === "*" || (e.endsWith(".*") && event.startsWith(e.slice(0, -2)))
    );

    if (!matches) continue;

    try {
      switch (channel.type) {
        case "slack":
          await sendSlack(channel.url, payload);
          break;
        case "discord":
          await sendDiscord(channel.url, payload);
          break;
        case "webhook":
          await sendWebhook(channel.url, payload);
          break;
        default:
          console.warn(`Unknown notification channel type: ${channel.type}`);
      }
    } catch (err) {
      console.error(`Notification to ${channel.type}/${channel.id} failed:`, err);
    }
  }
}

// ── Auto-notify on events ──

export function initNotifications() {
  // Listen for env-based channels (quick setup)
  const envChannels = [
    { env: "KICKD_NOTIFY_SLACK_URL", type: "slack" },
    { env: "KICKD_NOTIFY_DISCORD_URL", type: "discord" },
    { env: "KICKD_NOTIFY_WEBHOOK_URL", type: "webhook" },
  ];

  for (const { env, type } of envChannels) {
    const url = process.env[env];
    if (url) {
      console.log(`  Notification channel from env: ${type}`);
    }
  }

  // Wire event bus to notifications
  eventBus.onAll(async (event: KickdEvent) => {
    const notifiableEvents = [
      "task.completed", "task.failed", "task.retry",
      "skill.completed", "skill.failed",
    ];

    if (!notifiableEvents.includes(event.type)) return;

    const message = event.payload?.output
      ? String(event.payload.output).slice(0, 500)
      : event.payload?.error
        ? String(event.payload.error).slice(0, 500)
        : `${event.sourceType} ${event.sourceId} ${event.type}`;

    await notify(
      event.type,
      event.sourceType,
      event.sourceId,
      message,
      event.payload as Record<string, unknown> | undefined
    );

    // Also send to env-based channels
    for (const { env, type } of envChannels) {
      const url = process.env[env];
      if (!url) continue;

      const payload: NotificationPayload = {
        event: event.type,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        message,
        details: event.payload as Record<string, unknown> | undefined,
        timestamp: new Date().toISOString(),
      };

      try {
        switch (type) {
          case "slack": await sendSlack(url, payload); break;
          case "discord": await sendDiscord(url, payload); break;
          case "webhook": await sendWebhook(url, payload); break;
        }
      } catch (err) {
        console.error(`Env notification (${type}) failed:`, err);
      }
    }
  });
}
