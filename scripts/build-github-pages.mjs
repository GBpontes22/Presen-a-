import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const env = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key, value]) => key && !key.startsWith("=") && value != null)
    .map(([key, value]) => [key, String(value)]),
);

env.GITHUB_PAGES = "true";
env.NEXT_PUBLIC_BASE_PATH = "/Presen-a-";

const nextCommand = process.platform === "win32" ? "cmd.exe" : "node_modules/.bin/next";
const nextArgs =
  process.platform === "win32" ? ["/d", "/s", "/c", "node_modules\\.bin\\next.cmd build"] : ["build"];

const child = spawn(nextCommand, nextArgs, {
  env,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

if (exitCode !== 0) {
  process.exit(Number(exitCode));
}

await mkdir("out", { recursive: true });
await writeFile(join("out", ".nojekyll"), "");
