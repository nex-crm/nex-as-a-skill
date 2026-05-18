import { afterEach, describe, expect, test } from "bun:test";

import {
  binaryAssetName,
  detectPlatform,
  parseChecksums,
  UnsupportedPlatformError,
} from "./download-binary.js";

// install.sh publishes checksums.txt as `<sha256>  <filename>` (two spaces).
const SAMPLE_CHECKSUMS = `ac8d1dcb8deb8d5a758385239152948d28fab6d7d6a64aa85fb97c61753bb575  nex-cli-darwin-arm64
432f68dc33a5d0f77f1c56ad54b8de067868a9c40deb4880197026449c1dc892  nex-cli-darwin-x64
585840fa7efa40447a8380242c95497fbb027e831d28b41cc4c9231f45be63aa  nex-cli-linux-arm64
97b5e627f92216f87f1a1c96356cf57716f7682c23f122f71d522f994ecfb644  nex-cli-linux-x64
`;

describe("parseChecksums", () => {
  test("returns the lowercased hash for a listed asset", () => {
    expect(parseChecksums(SAMPLE_CHECKSUMS, "nex-cli-darwin-arm64")).toBe(
      "ac8d1dcb8deb8d5a758385239152948d28fab6d7d6a64aa85fb97c61753bb575",
    );
    expect(parseChecksums(SAMPLE_CHECKSUMS, "nex-cli-linux-x64")).toBe(
      "97b5e627f92216f87f1a1c96356cf57716f7682c23f122f71d522f994ecfb644",
    );
  });

  test("returns null for an asset not in the file", () => {
    expect(parseChecksums(SAMPLE_CHECKSUMS, "nex-cli-windows-x64")).toBeNull();
  });

  test("does not partial-match a filename prefix", () => {
    // "nex-cli-darwin" must not match the "nex-cli-darwin-arm64" line.
    expect(parseChecksums(SAMPLE_CHECKSUMS, "nex-cli-darwin")).toBeNull();
  });

  test("ignores blank lines and comments", () => {
    const text = `# checksums\n\n${SAMPLE_CHECKSUMS}`;
    expect(parseChecksums(text, "nex-cli-darwin-x64")).toBe(
      "432f68dc33a5d0f77f1c56ad54b8de067868a9c40deb4880197026449c1dc892",
    );
  });

  test("tolerates the binary-mode `*` filename prefix", () => {
    const text =
      "ac8d1dcb8deb8d5a758385239152948d28fab6d7d6a64aa85fb97c61753bb575 *nex-cli-darwin-arm64\n";
    expect(parseChecksums(text, "nex-cli-darwin-arm64")).toBe(
      "ac8d1dcb8deb8d5a758385239152948d28fab6d7d6a64aa85fb97c61753bb575",
    );
  });

  test("returns null on empty input", () => {
    expect(parseChecksums("", "nex-cli-linux-x64")).toBeNull();
  });
});

describe("detectPlatform / binaryAssetName", () => {
  const origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const origArch = Object.getOwnPropertyDescriptor(process, "arch");

  afterEach(() => {
    Object.defineProperty(process, "platform", origPlatform);
    Object.defineProperty(process, "arch", origArch);
  });

  function setEnv(platform, arch) {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    Object.defineProperty(process, "arch", { value: arch, configurable: true });
  }

  test("maps every supported OS/arch onto the release asset name", () => {
    setEnv("darwin", "arm64");
    expect(binaryAssetName()).toBe("nex-cli-darwin-arm64");
    setEnv("linux", "x64");
    expect(binaryAssetName()).toBe("nex-cli-linux-x64");
  });

  test("throws UnsupportedPlatformError on an OS with no prebuilt binary", () => {
    setEnv("win32", "x64");
    expect(() => detectPlatform()).toThrow(UnsupportedPlatformError);
  });

  test("throws UnsupportedPlatformError on an unknown architecture", () => {
    setEnv("linux", "ia32");
    expect(() => detectPlatform()).toThrow(UnsupportedPlatformError);
  });

  test("the current runtime resolves to a well-formed asset name", () => {
    expect(binaryAssetName()).toMatch(/^nex-cli-(darwin|linux)-(x64|arm64)$/);
  });
});
