interface LinkedInPostOptions {
  text: string;
  accessToken: string;
  personUrn: string;
}

interface LinkedInPostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

export async function postToLinkedIn(options: LinkedInPostOptions): Promise<LinkedInPostResult> {
  const { text, accessToken, personUrn } = options;

  const body = {
    author: personUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
  };

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 201) {
    const postId = response.headers.get("x-restli-id") ?? "unknown";
    return { success: true, postId };
  }

  const errorBody = await response.text();
  return {
    success: false,
    error: `LinkedIn API error (${response.status}): ${errorBody}`,
  };
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | { error: string }> {
  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (response.ok) {
    return { accessToken: data.access_token as string, expiresIn: data.expires_in as number };
  }

  return { error: `Token refresh failed: ${JSON.stringify(data)}` };
}
