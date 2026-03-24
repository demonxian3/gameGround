import { spawn } from "node:child_process";

const frontendPort = process.env.FRONTEND_PORT || "4173";
const backendPort = process.env.PORT || "3001";
const childProcesses = [];

function startProcess(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: true,
  });

  childProcesses.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of childProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`starting frontend on http://127.0.0.1:${frontendPort}`);
console.log(`starting backend on http://127.0.0.1:${backendPort}`);

startProcess("frontend", "node", ["scripts/dev-frontend.mjs"], { FRONTEND_PORT: frontendPort });
startProcess("backend", "npm", ["run", "start:backend"], { PORT: backendPort });

