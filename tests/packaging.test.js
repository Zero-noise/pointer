#!/usr/bin/env node
// Packaging integrity: every runtime file the extension actually loads must
// exist on disk AND be listed in package.sh.
//
// The zip's file list is hand-maintained, so the failure mode this guards is
// silent: add a script tag or a web-accessible stylesheet, forget package.sh,
// and the extension works perfectly when loaded unpacked and breaks only in the
// store build. Nothing else in the suite loads the real manifest and HTML the
// way Chrome does.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

// ——— What package.sh ships ———
const packageScript = read('package.sh');
const filesBlock = packageScript.match(/FILES=\(([\s\S]*?)\n\)/);
assert.ok(filesBlock, 'package.sh must declare a FILES=( ... ) array');
const packagedFiles = new Set(
    filesBlock[1]
        .split('\n')
        .map((line) => line.replace(/#.*$/, '').trim())
        .filter(Boolean)
);
assert.ok(packagedFiles.size > 0, 'package.sh FILES must not be empty');

// ——— What the manifest references ———
// Collected with provenance so a failure names the manifest key, not just a path.
const required = new Map();
function requireFile(relativePath, source) {
    if (!relativePath || /^(?:[a-z]+:)?\/\//i.test(relativePath)) return;
    const normalized = relativePath.replace(/^\.\//, '').split(/[?#]/)[0];
    if (!normalized) return;
    if (!required.has(normalized)) required.set(normalized, new Set());
    required.get(normalized).add(source);
}

requireFile('manifest.json', 'the package itself');

for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    requireFile(iconPath, `manifest icons.${size}`);
}
for (const [size, iconPath] of Object.entries((manifest.action || {}).default_icon || {})) {
    requireFile(iconPath, `manifest action.default_icon.${size}`);
}
requireFile((manifest.action || {}).default_popup, 'manifest action.default_popup');
requireFile((manifest.options_ui || {}).page, 'manifest options_ui.page');
requireFile((manifest.background || {}).service_worker, 'manifest background.service_worker');

for (const [index, entry] of (manifest.content_scripts || []).entries()) {
    for (const js of entry.js || []) requireFile(js, `manifest content_scripts[${index}].js`);
    for (const css of entry.css || []) requireFile(css, `manifest content_scripts[${index}].css`);
}
for (const [index, entry] of (manifest.web_accessible_resources || []).entries()) {
    for (const resource of entry.resources || []) {
        // Resource entries may be globs; only literal paths are checkable.
        if (/[*?]/.test(resource)) continue;
        requireFile(resource, `manifest web_accessible_resources[${index}].resources`);
    }
}

// ——— What the extension's own scripts and pages pull in at runtime ———
// importScripts() in the service worker is a real load-bearing reference that
// the manifest never mentions.
const serviceWorker = (manifest.background || {}).service_worker;
if (serviceWorker) {
    const workerSource = read(serviceWorker);
    for (const call of workerSource.matchAll(/importScripts\(([^)]*)\)/g)) {
        for (const literal of call[1].matchAll(/['"]([^'"]+)['"]/g)) {
            requireFile(literal[1], `${serviceWorker} importScripts()`);
        }
    }
}

const htmlPages = [...required.keys()].filter((file) => file.endsWith('.html'));
for (const page of htmlPages) {
    const html = read(page);
    for (const match of html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)) {
        requireFile(match[1], `${page} <script src>`);
    }
    for (const match of html.matchAll(/<link[^>]+href\s*=\s*["']([^"']+)["']/gi)) {
        requireFile(match[1], `${page} <link href>`);
    }
    for (const match of html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)) {
        if (match[1].startsWith('data:')) continue;
        requireFile(match[1], `${page} <img src>`);
    }
}

// Stylesheets injected by content.js via chrome.runtime.getURL().
const contentSource = read((manifest.content_scripts || [])[0].js[0]);
for (const match of contentSource.matchAll(/getURL\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    requireFile(match[1], 'content.js chrome.runtime.getURL()');
}

// ——— Assertions ———
const missingFromDisk = [];
const missingFromPackage = [];
for (const [file, sources] of [...required].sort()) {
    const where = [...sources].join(', ');
    if (!fs.existsSync(path.join(projectRoot, file))) {
        missingFromDisk.push(`${file} (referenced by ${where})`);
    }
    if (!packagedFiles.has(file)) {
        missingFromPackage.push(`${file} (referenced by ${where})`);
    }
}

assert.deepEqual(missingFromDisk, [], `referenced files missing from disk:\n  ${missingFromDisk.join('\n  ')}`);
assert.deepEqual(
    missingFromPackage,
    [],
    `referenced files missing from package.sh FILES:\n  ${missingFromPackage.join('\n  ')}`
);

// The reverse direction: package.sh must not ship a path that no longer exists.
const stalePackagedFiles = [...packagedFiles]
    .filter((file) => !fs.existsSync(path.join(projectRoot, file)))
    .sort();
assert.deepEqual(
    stalePackagedFiles,
    [],
    `package.sh lists files that do not exist:\n  ${stalePackagedFiles.join('\n  ')}`
);

// A dark-mode counterpart is swapped in per tab by background.js, which builds
// the path by string suffix rather than reading it from the manifest — so the
// manifest scan above can never see these.
for (const size of Object.keys(manifest.icons || {})) {
    const darkIcon = `images/icon${size}-white.png`;
    assert.ok(
        fs.existsSync(path.join(projectRoot, darkIcon)),
        `${darkIcon} is missing; background.js swaps to it for dark-scheme tabs`
    );
    assert.ok(
        packagedFiles.has(darkIcon),
        `${darkIcon} is missing from package.sh FILES`
    );
}

// Documentation, tests and repo metadata must never enter the upload.
for (const file of packagedFiles) {
    assert.doesNotMatch(file, /^tests\//, `package.sh must not ship test files (${file})`);
    assert.doesNotMatch(file, /\.md$/i, `package.sh must not ship documentation (${file})`);
}

console.log(`packaging: ok (${required.size} referenced files, ${packagedFiles.size} packaged)`);
