const fs = require(fs);
const path = require(path);

const ROOT = /Users/kevincheng/Library/CloudStorage/Dropbox/__NTU/__Thesis/_website/schematic-map-rwd_3/src;

function listFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(full));
    } else if (entry.isFile()) {
      if (full.endsWith(.js) || full.endsWith(.vue)) {
        result.push(full);
      }
    }
  }
  return result;
}

function processFile(file) {
  const original = fs.readFileSync(file, utf8);
  const lines = original.split(/\r?\n/);
  const out = [];
  let inConsoleBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inConsoleBlock) {
      const trimmed = line.trimStart();
      if (/^console\.log\(/.test(trimmed)) {
        // If single-line statement ends on same line, skip this line only
        if (/\)\s*;\s*$/.test(line)) {
          continue; // drop this line
        }
        // Start skipping until a line that is just ");" (allowing whitespace)
        inConsoleBlock = true;
        continue; // drop this starting line
      }
      out.push(line);
    } else {
      // We are inside a multi-line console.log block; look for a closing line like ");"
      if (/^\s*\)\s*;\s*$/.test(line)) {
        inConsoleBlock = false; // drop this closing line
        continue;
      }
      // drop intermediate lines
      continue;
    }
  }
  const next = out.join(n);
  if (next !== original) {
    fs.writeFileSync(file, next, utf8);
    return true;
  }
  return false;
}

const files = listFiles(ROOT);
let changed = 0;
for (const f of files) {
  if (processFile(f)) changed++;
}
console.log(`Processed ${files.length} files, modified ${changed}`);
EOF
node /Users/kevincheng/Library/CloudStorage/Dropbox/__NTU/__Thesis/_website/schematic-map-rwd_3/scripts/remove-console.js
