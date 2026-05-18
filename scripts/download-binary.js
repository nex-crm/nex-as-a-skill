/**
 * Downloads the `nex-cli` binary for the current platform from the latest
 * GitHub release and places it at bin/nex-cli inside this package.
 *
 * The release publishes one bare binary per platform plus a checksums.txt
 * (see install.sh, which targets the same assets):
 *
 *   nex-cli-darwin-arm64  nex-cli-darwin-x64
 *   nex-cli-linux-arm64   nex-cli-linux-x64
 *
 * ---------------------------------------------------------------------------
 * Integrity verification contract
 * ---------------------------------------------------------------------------
 * Every download is verified against the SHA256 listed for it in the
 * `checksums.txt` asset published on the same release. A mismatch — or an
 * unreachable / incomplete checksums file — aborts the install rather than
 * shipping an unverified binary: a compromised release token could otherwise
 * plant a backdoored binary on every machine that runs `npm install`.
 *
 * The npm package version is intentionally decoupled from the binary release
 * tag, so we resolve `releases/latest` (same as install.sh) rather than
 * pinning to package.json's version.
 */

import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "nex-crm/nex-as-a-skill";
const CHECKSUMS_FILENAME = "checksums.txt";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(here, "..");

/**
 * Thrown when the current OS/arch has no prebuilt nex-cli binary. Callers
 * (postinstall) treat this as non-fatal: the npm shim still installs and
 * surfaces an actionable hint at runtime.
 */
export class UnsupportedPlatformError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedPlatformError";
  }
}

/** Map Node's process.platform / process.arch onto the release asset naming. */
export function detectPlatform() {
  const osMap = { darwin: "darwin", linux: "linux" };
  const archMap = { x64: "x64", arm64: "arm64" };
  const os = osMap[process.platform];
  const arch = archMap[process.arch];
  if (!os) {
    throw new UnsupportedPlatformError(
      `nex-cli has no prebuilt binary for platform "${process.platform}" ` +
        `(supported: darwin, linux).`,
    );
  }
  if (!arch) {
    throw new UnsupportedPlatformError(
      `nex-cli has no prebuilt binary for architecture "${process.arch}" ` +
        `(supported: x64, arm64).`,
    );
  }
  return { os, arch };
}

/** Release asset filename for the current platform, e.g. nex-cli-darwin-arm64. */
export function binaryAssetName() {
  const { os, arch } = detectPlatform();
  return `nex-cli-${os}-${arch}`;
}

function assetUrl(filename) {
  return `https://github.com/${REPO}/releases/latest/download/${filename}`;
}

/**
 * Parse a `checksums.txt` (one `<sha256hex>  <filename>` line per asset) and
 * return the lowercased hash for `filename`, or null when it is not listed.
 */
export function parseChecksums(text, filename) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // `*` prefix on the name marks a binary-mode entry in some sha tools.
    const match = trimmed.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match && match[2] === filename) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Download, verify, and install the nex-cli binary into bin/nex-cli.
 *
 * Options:
 *   silent    — suppress progress output on stderr.
 *   targetDir — directory to install into; defaults to this package's bin/.
 *
 * Resolves with the installed binary path. Rejects with an
 * UnsupportedPlatformError on win32 / unknown arch, or a plain Error on a
 * network failure or an integrity violation (message contains "SHA256
 * mismatch" / "verify download integrity" so postinstall can branch on it).
 */
export async function downloadBinary({ silent = false, targetDir } = {}) {
  const assetName = binaryAssetName(); // throws UnsupportedPlatformError
  const binDir = targetDir ?? join(PACKAGE_ROOT, "bin");
  const binaryPath = join(binDir, "nex-cli");
  const log = (msg) => {
    if (!silent) process.stderr.write(`nex-cli: ${msg}\n`);
  };

  log(`downloading ${assetName} from the latest release`);
  const binaryBuf = await fetchBuffer(assetUrl(assetName));

  // Integrity check BEFORE the binary is written anywhere executable.
  let checksumsText;
  try {
    checksumsText = await fetchText(assetUrl(CHECKSUMS_FILENAME));
  } catch (err) {
    throw new Error(
      `Cannot verify download integrity: failed to fetch ${CHECKSUMS_FILENAME} ` +
        `(${err.message}). Refusing to install an unverified binary.`,
    );
  }
  const expected = parseChecksums(checksumsText, assetName);
  if (!expected) {
    throw new Error(
      `Cannot verify download integrity: ${assetName} is not listed in ` +
        `${CHECKSUMS_FILENAME}. Refusing to install an unverified binary.`,
    );
  }
  const actual = sha256(binaryBuf);
  if (actual !== expected) {
    throw new Error(
      `SHA256 mismatch for ${assetName}.\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `Refusing to install. This may indicate a tampered release asset or a ` +
        `corrupted download. Retry on a clean network; if it persists, file an ` +
        `issue at https://github.com/${REPO}/issues.`,
    );
  }
  log("checksum verified");

  await fsp.mkdir(binDir, { recursive: true });
  await fsp.writeFile(binaryPath, binaryBuf);
  await fsp.chmod(binaryPath, 0o755);
  log(`installed to ${binaryPath}`);

  return binaryPath;
}
