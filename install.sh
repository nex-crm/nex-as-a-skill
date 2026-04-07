#!/bin/sh
set -e

REPO="nex-crm/nex-as-a-skill"
PRIMARY_DIR="${HOME}/.local/bin"
FALLBACK_DIR="/usr/local/bin"

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

curl -fsSL "${BASE_URL}/${BINARY}" -o "$TMP"

# Verify checksum if available
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

# Install binary — prefer ~/.local/bin (no sudo, no macOS sandbox issues)
do_install() {
    local dir="$1"
    local use_sudo="$2"
    local cmd=""
    [ "$use_sudo" = "true" ] && cmd="sudo"
    $cmd mkdir -p "$dir"
    $cmd mv "$TMP" "${dir}/nex-cli"
    TARGET_DIR="$dir"
}

if do_install "$PRIMARY_DIR" false 2>/dev/null; then
    : # installed to ~/.local/bin
elif [ -w "$FALLBACK_DIR" ]; then
    do_install "$FALLBACK_DIR" false
elif [ "$(id -u)" = "0" ]; then
    do_install "$FALLBACK_DIR" false
elif command -v sudo > /dev/null 2>&1; then
    echo "Installing to ${FALLBACK_DIR} (requires sudo)..."
    do_install "$FALLBACK_DIR" true
else
    echo "Error: cannot install to ${PRIMARY_DIR} or ${FALLBACK_DIR}"
    exit 1
fi

echo "nex-cli installed to ${TARGET_DIR}/nex-cli"

# Ensure PATH includes the install directory for the current session
case ":$PATH:" in
    *":${TARGET_DIR}:"*) ;;
    *)
        export PATH="${TARGET_DIR}:$PATH"
        echo "Added ${TARGET_DIR} to PATH for this session."

        # Persist to shell RC if not already there
        for rc in "${HOME}/.zshrc" "${HOME}/.bashrc" "${HOME}/.profile"; do
            if [ -f "$rc" ]; then
                if ! grep -q "${TARGET_DIR}" "$rc" 2>/dev/null; then
                    echo "" >> "$rc"
                    echo "# Added by nex-cli installer" >> "$rc"
                    echo "export PATH=\"${TARGET_DIR}:\$PATH\"" >> "$rc"
                    echo "Updated ${rc} with PATH."
                fi
                break
            fi
        done
        ;;
esac

echo ""
echo "Get started:"
echo "  nex-cli --cmd \"setup you@company.com\""
