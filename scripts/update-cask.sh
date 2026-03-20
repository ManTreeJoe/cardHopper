#!/bin/bash
# Updates the Homebrew cask formula with the new version and sha256 after a release build.
# Usage: ./scripts/update-cask.sh <version>
# Example: ./scripts/update-cask.sh 1.4.0

set -e

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

DMG="dist/Card Hopper-${VERSION}-arm64.dmg"

if [ ! -f "$DMG" ]; then
  echo "Error: DMG not found at: $DMG"
  echo "Run 'npm run build:mac' first."
  exit 1
fi

SHA=$(shasum -a 256 "$DMG" | awk '{print $1}')
echo "Version: $VERSION"
echo "SHA256:  $SHA"

CASK="homebrew-tap/Casks/card-hopper.rb"

sed -i '' "s/version \".*\"/version \"${VERSION}\"/" "$CASK"
sed -i '' "s/sha256 .*/sha256 \"${SHA}\"/" "$CASK"

echo "Updated $CASK"
echo ""
echo "Next steps:"
echo "  1. Copy homebrew-tap/ contents to your ManTreeJoe/homebrew-cardhopper repo"
echo "  2. Commit and push the updated cask"
