#!/usr/bin/env bash
# One-time setup: give GitHub Actions the APK signing key so it can build
# signed releases. Run from the project folder:
#     bash scripts/upload-signing-secrets.sh
set -euo pipefail
REPO="${1:-LOKRANJAN184/CSB}"
DIR="$HOME/chendurar-signing"
set -a; . "$DIR/keystore.properties"; set +a
base64 -w0 "$DIR/release.keystore" | gh secret set ANDROID_KEYSTORE_BASE64 -R "$REPO"
printf %s "$ANDROID_KEYSTORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD -R "$REPO"
printf %s "$ANDROID_KEY_ALIAS"         | gh secret set ANDROID_KEY_ALIAS -R "$REPO"
printf %s "$ANDROID_KEY_PASSWORD"      | gh secret set ANDROID_KEY_PASSWORD -R "$REPO"
gh secret list -R "$REPO"
