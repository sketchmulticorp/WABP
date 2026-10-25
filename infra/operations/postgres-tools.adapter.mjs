import { spawn } from "node:child_process";

/** Uses the existing local compose PostgreSQL toolchain; credentials never enter argv or logs. */
export function runPostgresTool(url, tool, name, input) {
  if (
    !/^phase8_(source|restore)_[a-f0-9]{32}$/u.test(name) ||
    !["pg_dump", "pg_restore"].includes(tool)
  )
    throw new Error("UNSAFE_RECOVERY_TOOL_ARGUMENT");
  const args = [
    "compose",
    "exec",
    "-T",
    "--env",
    "PGPASSWORD",
    "--env",
    "PGUSER",
    "--env",
    "PGHOST=127.0.0.1",
    "postgres",
    tool,
    "--no-password",
    "--dbname",
    name,
  ];
  args.push(
    ...(tool === "pg_dump"
      ? ["--format=custom"]
      : ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges"]),
  );
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: new URL("../../", import.meta.url),
      windowsHide: true,
      env: {
        ...process.env,
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("RECOVERY_TOOL_TIMEOUT"));
    }, 120000);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("RECOVERY_TOOL_UNAVAILABLE"));
    });
    child.stderr.resume(); // Never echo potentially sensitive CLI diagnostics into a report.
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) {
        child.kill();
        reject(new Error("SYNTHETIC_BACKUP_TOO_LARGE"));
      } else chunks.push(chunk);
    });
    child.stdin.on("error", () => undefined);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error("RECOVERY_TOOL_FAILED"));
    });
    child.stdin.end(input);
  });
}
