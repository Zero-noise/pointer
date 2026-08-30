#!/usr/bin/env bash
# Build a Chrome Web Store upload zip containing only the files the extension
# ships. Everything else in the repo (docs, tests, git metadata, macOS cruft)
# is intentionally left out.
set -euo pipefail

cd "$(dirname "$0")"

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/pointer-${VERSION}.zip"

FILES=(
    manifest.json
    background.js
    content.js
    settings.js
    i18n.js
    popup.html
    popup.js
    options.html
    options.js
    theme.css
    content.css
    content-page.css
    images/icon16.png
    images/icon32.png
    images/icon48.png
    images/icon128.png
    images/icon16-white.png
    images/icon32-white.png
    images/icon48-white.png
    images/icon128-white.png
)

for file in "${FILES[@]}"; do
    [ -f "$file" ] || { echo "missing: $file" >&2; exit 1; }
done

# Fail early rather than shipping a build the regression suite rejects.
# packaging.test.js checks the FILES list above against what the manifest and
# the HTML pages actually load, so a forgotten entry fails here instead of
# shipping a build that only breaks once installed from the store.
node tests/security-regression.test.js
node tests/shortcut.test.js
node tests/permission-migration.test.js
node tests/packaging.test.js

mkdir -p dist
rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"

echo "built $OUT"
unzip -l "$OUT"
