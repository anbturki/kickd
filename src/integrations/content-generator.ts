import { askClaude } from "../bridge/claude";
import { join } from "path";

const HISTORY_FILE = join(import.meta.dir, "..", "..", "data", "linkedin-history.json");

interface PostHistory {
  posts: Array<{
    date: string;
    topic: string;
    content: string;
  }>;
}

async function loadHistory(): Promise<PostHistory> {
  try {
    const file = Bun.file(HISTORY_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // ignore
  }
  return { posts: [] };
}

async function saveHistory(history: PostHistory) {
  await Bun.write(HISTORY_FILE, JSON.stringify(history, null, 2));
}

export async function generateLinkedInPost(config: {
  topics: string[];
  tone: string;
  audience: string;
  extraInstructions?: string;
}): Promise<{ topic: string; content: string }> {
  const history = await loadHistory();
  const recentTopics = history.posts.slice(-14).map((p) => p.topic);

  const prompt = `You are a LinkedIn content creator. Generate a single LinkedIn post.

Requirements:
- Topics to choose from: ${config.topics.join(", ")}
- Tone: ${config.tone}
- Target audience: ${config.audience}
${config.extraInstructions ? `- Additional instructions: ${config.extraInstructions}` : ""}
- Recently covered topics (avoid repeating): ${recentTopics.join(", ") || "none yet"}
- Keep it under 1300 characters (LinkedIn limit for full visibility without "see more")
- Make it engaging, use short paragraphs
- Include a call to action at the end
- Do NOT use hashtags excessively (max 3)
- Do NOT use emojis excessively (max 3 total)

Respond in this exact JSON format and nothing else:
{"topic": "the topic you chose", "content": "the full post text"}`;

  const result = await askClaude({
    prompt,
    workingDir: process.cwd(),
  });

  if (!result.success) {
    throw new Error(`Content generation failed: ${result.output}`);
  }

  // Extract JSON from Claude's response
  const jsonMatch = result.output.match(/\{[\s\S]*"topic"[\s\S]*"content"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse generated content: ${result.output}`);
  }

  const generated = JSON.parse(jsonMatch[0]) as { topic: string; content: string };

  // Save to history
  history.posts.push({
    date: new Date().toISOString(),
    topic: generated.topic,
    content: generated.content,
  });
  await saveHistory(history);

  return generated;
}
