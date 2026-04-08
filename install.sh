#!/bin/sh
set -e

REPO="nex-crm/nex-as-a-skill"
INSTALL_DIR="/usr/local/bin"
FALLBACK_DIR="${HOME}/.local/bin"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64)  ARCH="x64" ;;
    aarch64) ARCH="arm64" ;;
    arm64)   ARCH="arm64" ;;
    *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
    darwin|linux) ;;
    *)            echo "Unsupported OS: $OS"; exit 1 ;;
esac

BINARY="nex-cli-${OS}-${ARCH}"
BASE_URL="https://github.com/${REPO}/releases/latest/download"
echo "Downloading ${BINARY}..."

TMP=$(mktemp)
trap 'rm -f "$TMP" "$TMP.checksums"' EXIT

curl -fsSL "${BASE_URL}/${BINARY}" -o "$TMP" || {
    echo ""
    echo "Download failed. No release found at:"
    echo "  ${BASE_URL}/${BINARY}"
    echo ""
    echo "Check https://github.com/${REPO}/releases for available versions."
    exit 1
}

# Verify checksum
curl -fsSL "${BASE_URL}/checksums.txt" -o "$TMP.checksums" 2>/dev/null || true
if [ -f "$TMP.checksums" ] && [ -s "$TMP.checksums" ]; then
    EXPECTED=$(grep "$BINARY" "$TMP.checksums" | awk '{print $1}')
    if [ -n "$EXPECTED" ]; then
        if command -v sha256sum > /dev/null 2>&1; then
            ACTUAL=$(sha256sum "$TMP" | awk '{print $1}')
        elif command -v shasum > /dev/null 2>&1; then
            ACTUAL=$(shasum -a 256 "$TMP" | awk '{print $1}')
        else
            ACTUAL="$EXPECTED"
        fi
        if [ "$ACTUAL" != "$EXPECTED" ]; then
            echo "Checksum mismatch! Expected ${EXPECTED}, got ${ACTUAL}"
            exit 1
        fi
        echo "Checksum verified."
    fi
fi

chmod +x "$TMP"

# Verify binary runs
VERSION_OUT=$("$TMP" --version 2>/dev/null) || {
    echo "Downloaded binary failed to execute. This may be a platform mismatch."
    echo "Expected: ${OS}-${ARCH}"
    exit 1
}
echo "Version: ${VERSION_OUT}"

# Install binary
do_install() {
    dir="$1"
    use_sudo="$2"
    cmd=""
    [ "$use_sudo" = "true" ] && cmd="sudo"
    $cmd mkdir -p "$dir"
    $cmd mv "$TMP" "${dir}/nex-cli"
    TARGET_DIR="$dir"
}

if [ -w "$INSTALL_DIR" ]; then
    do_install "$INSTALL_DIR" false
elif [ "$(id -u)" = "0" ]; then
    do_install "$INSTALL_DIR" false
elif command -v sudo > /dev/null 2>&1; then
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    do_install "$INSTALL_DIR" true
else
    do_install "$FALLBACK_DIR" false
fi

echo "nex-cli installed to ${TARGET_DIR}/nex-cli"

# Check PATH
case ":$PATH:" in
    *":${TARGET_DIR}:"*) ;;
    *) echo ""; echo "Add to your PATH:  export PATH=\"${TARGET_DIR}:\$PATH\"" ;;
esac

echo ""
echo "Get started:"
echo "  nex-cli --cmd \"setup you@company.com\""
