import type { ClaudeBridgeRequest, ClaudeBridgeResponse } from "../types";

export async function askClaude(request: ClaudeBridgeRequest): Promise<ClaudeBridgeResponse> {
  const args = ["claude", "--print", request.prompt];

  if (request.allowedTools?.length) {
    args.push("--allowedTools", request.allowedTools.join(","));
  }

  const proc = Bun.spawn(args, {
    cwd: request.workingDir ?? process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    output: output || stderr,
    exitCode,
  };
}
