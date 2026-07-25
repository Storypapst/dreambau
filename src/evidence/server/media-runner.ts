import { execFile } from "node:child_process";
import type { ToolResult } from "../media.js";

const tenMinutes = 10 * 60 * 1000;

/**
 * Runs ffmpeg/ffprobe without a shell, so a filename can never become part of a
 * command line the shell would re-interpret.
 */
export function spawnMediaTool(command: string, args: string[]): Promise<ToolResult> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: tenMinutes, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error && typeof (error as { code?: unknown }).code === "number"
        ? Number((error as { code: number }).code)
        : error ? 1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}
