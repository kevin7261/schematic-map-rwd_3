const fs = require('fs');
const path = require('path');

const ROOT =
  '/Users/kevincheng/Library/CloudStorage/Dropbox/__NTU/__Thesis/_website/schematic-map-rwd_3/src';

function listFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(full));
    } else if (entry.isFile()) {
      if (full.endsWith('.js') || full.endsWith('.vue')) {
        result.push(full);
      }
    }
  }
  return result;
}

function removeConsoleLogs(source) {
  const chars = Array.from(source);
  const len = chars.length;
  let out = '';
  let i = 0;

  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  function matchSeq(seq) {
    for (let k = 0; k < seq.length; k++) {
      if (chars[i + k] !== seq[k]) return false;
    }
    return true;
  }

  while (i < len) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (inLineComment) {
      out += ch;
      i++;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      out += ch;
      i++;
      if (ch === '*' && next === '/') {
        out += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (inSingle) {
      out += ch;
      i++;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i++;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      out += ch;
      i++;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i++;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (inTemplate) {
      out += ch;
      i++;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i++;
      } else if (ch === '`') {
        inTemplate = false;
      }
      continue;
    }

    // enter comments
    if (ch === '/' && next === '/') {
      out += ch + next;
      i += 2;
      inLineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      out += ch + next;
      i += 2;
      inBlockComment = true;
      continue;
    }

    // enter strings
    if (ch === "'") {
      out += ch;
      i++;
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      i++;
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      out += ch;
      i++;
      inTemplate = true;
      continue;
    }

    // detect console.log(
    if (matchSeq('console.log(')) {
      // skip console.log call with balanced parentheses
      i += 'console.log('.length;
      let depth = 1;
      let sSingle = false,
        sDouble = false,
        sTemplate = false,
        sLine = false,
        sBlock = false;
      while (i < len) {
        const c = chars[i];
        const n = chars[i + 1];
        if (sLine) {
          i++;
          if (c === '\n') sLine = false;
          continue;
        }
        if (sBlock) {
          if (c === '*' && n === '/') {
            i += 2;
            sBlock = false;
          } else {
            i++;
          }
          continue;
        }
        if (sSingle) {
          if (c === '\\' && n !== undefined) {
            i += 2;
          } else if (c === "'") {
            i++;
            sSingle = false;
          } else {
            i++;
          }
          continue;
        }
        if (sDouble) {
          if (c === '\\' && n !== undefined) {
            i += 2;
          } else if (c === '"') {
            i++;
            sDouble = false;
          } else {
            i++;
          }
          continue;
        }
        if (sTemplate) {
          if (c === '\\' && n !== undefined) {
            i += 2;
          } else if (c === '`') {
            i++;
            sTemplate = false;
          } else {
            i++;
          }
          continue;
        }
        if (c === "'") {
          sSingle = true;
          i++;
          continue;
        }
        if (c === '"') {
          sDouble = true;
          i++;
          continue;
        }
        if (c === '`') {
          sTemplate = true;
          i++;
          continue;
        }
        if (c === '/' && n === '/') {
          i += 2;
          sLine = true;
          continue;
        }
        if (c === '/' && n === '*') {
          i += 2;
          sBlock = true;
          continue;
        }
        if (c === '(') {
          depth++;
          i++;
          continue;
        }
        if (c === ')') {
          depth--;
          i++;
          if (depth === 0) break;
          else continue;
        }
        i++;
      }
      // skip optional whitespace and semicolon after )
      while (i < len && /\s/.test(chars[i])) i++;
      if (chars[i] === ';') i++;
      // do not emit anything for this call
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

function processFile(file) {
  const original = fs.readFileSync(file, 'utf8');
  const next = removeConsoleLogs(original);
  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8');
    return true;
  }
  return false;
}

const files = listFiles(ROOT);
let changed = 0;
for (const f of files) {
  if (processFile(f)) changed++;
}
console.log(JSON.stringify({ total: files.length, changed }));
