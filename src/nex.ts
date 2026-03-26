#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { basename, join } from "node:path";
import { writeFileSync } from "node:fs";

const VERSION = "0.2.0";

const args = process.argv.slice(2);

// Detect if invoked as nex-mcp (via symlink) — prepend "mcp" to args
const invoked = basename(process.argv[1] ?? process.argv[0] ?? "");
if (invoked === "nex-mcp" || invoked === "nex-mcp.ts") {
  args.unshift("mcp");
}

// --version: print own version + nex-cli version if available
if (args[0] === "--version" || args[0] === "-v") {
  console.log(`nex ${VERSION}`);
  const cli = findNexCli();
  if (cli) {
    try {
      execFileSync(cli, ["--version"], { stdio: "inherit" });
    } catch {
      // nex-cli doesn't support --version, that's fine
    }
  }
  process.exit(0);
}

// Main flow: find nex-cli, delegate, or auto-install
let nexCli = findNexCli();
if (!nexCli) {
  nexCli = await autoInstall();
}
delegate(nexCli, args);

// ---

function findNexCli(): string | null {
  // 1. Try nex-cli on PATH
  try {
    execFileSync("which", ["nex-cli"], { stdio: "pipe" });
    return "nex-cli";
  } catch {
    // not on PATH
  }

  // 2. Common install locations
  const candidates = [
    "/usr/local/bin/nex-cli",
    join(homedir(), ".local", "bin", "nex-cli"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

function delegate(cli: string, cliArgs: string[]): never {
  try {
    execFileSync(cli, cliArgs, { stdio: "inherit" });
    process.exit(0);
  } catch (err: any) {
    // Propagate the exit code from nex-cli
    if (err.status !== null && err.status !== undefined) {
      process.exit(err.status);
    }
    process.exit(1);
  }
}

async function autoInstall(): Promise<string> {
  const os = detectOS();
  const ar = detectArch();
  const binary = `nex-cli-${os}-${ar}`;
  const url = `https://github.com/nex-crm/nex-cli/releases/latest/download/${binary}`;
  const installDir = join(homedir(), ".local", "bin");
  const installPath = join(installDir, "nex-cli");

  console.error(`nex-cli not found. Downloading ${binary}...`);

  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      console.error(
        `Failed to download nex-cli: ${response.status} ${response.statusText}`
      );
      console.error(
        `\nInstall manually:\n  curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh\n`
      );
      process.exit(1);
    }

    const data = await response.arrayBuffer();

    mkdirSync(installDir, { recursive: true });
    writeFileSync(installPath, Buffer.from(data));
    chmodSync(installPath, 0o755);

    console.error(`nex-cli installed to ${installPath}`);

    // Check if installDir is on PATH
    const pathDirs = (process.env.PATH ?? "").split(":");
    if (!pathDirs.includes(installDir)) {
      console.error(
        `\nAdd to your PATH:  export PATH="${installDir}:$PATH"\n`
      );
    }

    return installPath;
  } catch (err: any) {
    console.error(`Failed to download nex-cli: ${err.message}`);
    console.error(
      `\nInstall manually:\n  curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh\n`
    );
    process.exit(1);
  }
}

function detectOS(): string {
  const p = platform();
  switch (p) {
    case "darwin":
      return "darwin";
    case "linux":
      return "linux";
    default:
      console.error(`Unsupported OS: ${p}`);
      process.exit(1);
  }
}

function detectArch(): string {
  const a = arch();
  switch (a) {
    case "arm64":
      return "arm64";
    case "x64":
      return "x64";
    default:
      console.error(`Unsupported architecture: ${a}`);
      process.exit(1);
  }
}
