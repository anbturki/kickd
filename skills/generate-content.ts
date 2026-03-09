import { z } from "zod";
import { skills } from "../src/skills/engine";
import { askClaude } from "../src/bridge/claude";
import { join } from "path";

const HISTORY_FILE = join(import.meta.dir, "..", "data", "linkedin-history.json");

interface PostHistory {
  posts: Array<{ date: string; topic: string; content: string }>;
}

async function loadHistory(): Promise<PostHistory> {
  try {
    const file = Bun.file(HISTORY_FILE);
    if (await file.exists()) return await file.json();
  } catch {}
  return { posts: [] };
}

async function saveToHistory(topic: string, content: string) {
  const history = await loadHistory();
  history.posts.push({ date: new Date().toISOString(), topic, content });
  await Bun.write(HISTORY_FILE, JSON.stringify(history, null, 2));
}

skills.register({
  id: "generate-content",
  name: "Generate Content",
  description: "Generate social media content using Claude. Returns topic and content text.",
  input: z.object({
    platform: z.string().describe("Target platform: linkedin, twitter, etc."),
    topics: z.array(z.string()).describe("Topics to write about"),
    tone: z.string().optional().describe("Tone of voice"),
    audience: z.string().optional().describe("Target audience"),
    instructions: z.string().optional().describe("Extra instructions for content generation"),
  }),
  output: z.object({
    topic: z.string(),
    content: z.string(),
  }),
  execute: async (input) => {
    const history = await loadHistory();
    const recentTopics = history.posts.slice(-14).map((p) => p.topic);

    const platformRules: Record<string, string> = {
      linkedin:
        "Keep under 1300 characters. Use short paragraphs. Include a call to action. Max 3 hashtags, max 3 emojis.",
      twitter: "Keep under 280 characters. Be punchy and direct. Max 2 hashtags.",
    };

    const rules = platformRules[input.platform] ?? "Keep it concise and engaging.";

    const prompt = `You are a ${input.platform} content creator. Generate a single post.

Requirements:
- Topics to choose from: ${input.topics.join(", ")}
- Tone: ${input.tone ?? "professional but approachable"}
- Audience: ${input.audience ?? "tech professionals"}
- Platform rules: ${rules}
${input.instructions ? `- Additional: ${input.instructions}` : ""}
- Recently covered (avoid repeating): ${recentTopics.join(", ") || "none yet"}

Respond in this exact JSON format and nothing else:
{"topic": "the topic you chose", "content": "the full post text"}`;

    const result = await askClaude({ prompt });

    if (!result.success) {
      throw new Error(`Content generation failed: ${result.output}`);
    }

    const jsonMatch = result.output.match(/\{[\s\S]*"topic"[\s\S]*"content"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Could not parse response: ${result.output}`);
    }

    const generated = JSON.parse(jsonMatch[0]) as { topic: string; content: string };
    await saveToHistory(generated.topic, generated.content);
    return generated;
  },
});
