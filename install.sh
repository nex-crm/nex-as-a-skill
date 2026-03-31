#!/bin/sh
set -e

REPO="nex-crm/nex-as-a-skill"
INSTALL_DIR="/usr/local/bin"

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
echo "Downloading ${BINARY}..."

DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY}"
TMP=$(mktemp)
curl -fsSL "$DOWNLOAD_URL" -o "$TMP"
chmod +x "$TMP"

# Install
if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP" "${INSTALL_DIR}/nex-cli"
else
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$TMP" "${INSTALL_DIR}/nex-cli"
fi

echo "nex-cli installed to ${INSTALL_DIR}/nex-cli"
echo "Run 'nex-cli' to get started."
