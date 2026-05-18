/**
 * Postinstall: fetch and verify the nex-cli binary so `npm install @nex-ai/nex`
 * (and `npx @nex-ai/nex`) produce a working CLI without a separate curl step.
 *
 * Failure policy:
 *   - Integrity failures (SHA256 mismatch, unverifiable download) are ALWAYS
 *     fatal. Continuing would let a tampered release asset install silently.
 *   - Unsupported platforms (Windows) and network failures are NON-fatal: the
 *     bin/nex.js shim still installs and prints an actionable hint at runtime,
 *     so a corp proxy blocking github.com must not break `npm install`.
 *
 * Escape hatches:
 *   NEX_SKIP_POSTINSTALL=1  — skip the download entirely (offline mirrors,
 *                             CI images that restore a prebuilt bin/).
 *   NEX_POSTINSTALL_STRICT=1 — promote network failures to fatal, for callers
 *                             that want the install to fail loudly instead.
 */

import { downloadBinary } from "./download-binary.js";

if (process.env.NEX_SKIP_POSTINSTALL === "1") {
  process.stderr.write("nex-cli: postinstall skipped via NEX_SKIP_POSTINSTALL=1\n");
  process.exit(0);
}

try {
  await downloadBinary();
} catch (err) {
  const message = err?.message ? err.message : String(err);
  const isIntegrityFailure =
    message.includes("SHA256 mismatch") || message.includes("verify download integrity");

  // Integrity failures are always fatal — no soft-fail, no strict-mode opt-out.
  if (isIntegrityFailure) {
    process.stderr.write(
      `\nnex-cli: SECURITY: ${message}\n` +
        "nex-cli: aborting install. No binary has been placed in bin/.\n\n",
    );
    process.exit(1);
  }

  // Unsupported platform / network failure. Non-fatal by default: the shim
  // degrades gracefully and prints install instructions at runtime.
  if (process.env.NEX_POSTINSTALL_STRICT === "1") {
    process.stderr.write(`\nnex-cli: postinstall download failed: ${message}\n\n`);
    process.exit(1);
  }
  process.stderr.write(
    `nex-cli: postinstall could not download the binary (${message}).\n` +
      "nex-cli: install will continue; run `npm install -g @nex-ai/nex` again, " +
      "or the curl install script, to retry. Set NEX_POSTINSTALL_STRICT=1 to " +
      "make this failure fatal.\n",
  );
  process.exit(0);
}
