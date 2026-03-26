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

BINARY="nex-${OS}-${ARCH}"
echo "Downloading ${BINARY}..."

DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY}"
TMP=$(mktemp)
curl -fsSL "$DOWNLOAD_URL" -o "$TMP"
chmod +x "$TMP"

# Install binary
if [ -w "$INSTALL_DIR" ]; then
    TARGET_DIR="$INSTALL_DIR"
else
    if [ -w "$(dirname "$INSTALL_DIR")" ] || [ "$(id -u)" = "0" ]; then
        echo "Installing to ${INSTALL_DIR} (requires sudo)..."
        sudo mv "$TMP" "${INSTALL_DIR}/nex"
        sudo ln -sf "${INSTALL_DIR}/nex" "${INSTALL_DIR}/nex-mcp"
        TARGET_DIR="$INSTALL_DIR"
    else
        mkdir -p "$FALLBACK_DIR"
        mv "$TMP" "${FALLBACK_DIR}/nex"
        ln -sf "${FALLBACK_DIR}/nex" "${FALLBACK_DIR}/nex-mcp"
        TARGET_DIR="$FALLBACK_DIR"
    fi
fi

# Handle the writable case
if [ "$TARGET_DIR" = "$INSTALL_DIR" ] && [ -f "$TMP" ]; then
    mv "$TMP" "${INSTALL_DIR}/nex"
    ln -sf "${INSTALL_DIR}/nex" "${INSTALL_DIR}/nex-mcp"
fi

echo "nex installed to ${TARGET_DIR}/nex"
echo "nex-mcp symlinked to ${TARGET_DIR}/nex-mcp"

# Check PATH
case ":$PATH:" in
    *":${TARGET_DIR}:"*) ;;
    *) echo "\nAdd to your PATH:  export PATH=\"${TARGET_DIR}:\$PATH\"" ;;
esac

echo ""
echo "Get started:"
echo "  nex register --email you@company.com"
echo "  nex setup"
