import type { Task, TaskResult } from "../src/types";
import { skills } from "../src/skills/engine";

export const task: Task = {
  id: "linkedin-post",
  name: "Daily LinkedIn Post",
  description: "Generates and publishes a LinkedIn post daily using skills",
  handler: "tasks/linkedin-post.ts",
  schedule: "at:09:00", // posts daily at 9:00 AM local time
  enabled: true,
  status: "idle",
};

const DEFAULT_TOPICS = [
  "software engineering",
  "developer productivity",
  "tech leadership",
  "open source",
  "career growth in tech",
];

export async function handler(params?: Record<string, unknown>): Promise<TaskResult> {
  const dryRun = params?.dryRun === true;
  const customTopic = params?.topic as string | undefined;

  const topics = customTopic ? [customTopic] : DEFAULT_TOPICS;

  // Step 1: Generate content using the generate-content skill
  const generated = await skills.run("generate-content", {
    platform: "linkedin",
    topics,
    tone: "professional but approachable, insightful, sharing real experience",
    audience: "software engineers, tech leads, and engineering managers",
    instructions: customTopic ? `Focus specifically on: ${customTopic}` : undefined,
  });

  if (!generated.success) {
    return { success: false, output: `Content generation failed: ${generated.error}`, duration: 0 };
  }

  const { topic, content } = generated.output as { topic: string; content: string };

  if (dryRun) {
    return {
      success: true,
      output: `[DRY RUN] Generated post:\n\nTopic: ${topic}\n\n${content}`,
      duration: 0,
    };
  }

  // Step 2: Post using the post-linkedin skill
  const posted = await skills.run("post-linkedin", { content });

  if (!posted.success) {
    return { success: false, output: `Post failed: ${posted.error}\n\nContent was:\n${content}`, duration: 0 };
  }

  const result = posted.output as { posted: boolean; postId?: string };
  return {
    success: true,
    output: `Posted to LinkedIn! Post ID: ${result.postId}\nTopic: ${topic}\n\n${content}`,
    duration: 0,
  };
}
