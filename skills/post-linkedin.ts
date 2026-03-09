import { z } from "zod";
import { skills } from "../src/skills/engine";
import { postToLinkedIn } from "../src/integrations/linkedin";

skills.register({
  id: "post-linkedin",
  name: "Post to LinkedIn",
  description: "Publish a text post to LinkedIn",
  input: z.object({
    content: z.string().describe("The post text to publish"),
    dryRun: z.boolean().optional().describe("If true, skip actual posting"),
  }),
  output: z.object({
    posted: z.boolean(),
    postId: z.string().optional(),
    content: z.string(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    if (input.dryRun) {
      return { posted: false, content: input.content, postId: "[dry-run]" };
    }

    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    const personUrn = process.env.LINKEDIN_PERSON_URN;

    if (!accessToken || !personUrn) {
      throw new Error("Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN in environment");
    }

    const result = await postToLinkedIn({
      text: input.content,
      accessToken,
      personUrn,
    });

    if (result.success) {
      return { posted: true, postId: result.postId, content: input.content };
    }

    return { posted: false, content: input.content, error: result.error };
  },
});
