// Shared icon search utility for Vercel serverless functions
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const metaPath = join(__dirname, '..', '3d icons', 'meta.json');
const availablePath = join(__dirname, '_available-icons.json');

let _index = null;
const _availableSet = new Set(JSON.parse(readFileSync(availablePath, 'utf8')));

function availableIcons() {
  return _availableSet;
}

export function getIconIndex() {
  if (_index) return _index;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const present = availableIcons();
  const wordIndex = new Map();
  for (const item of meta.items) {
    if (present.size > 0 && !present.has(item.file_name)) continue;
    const text = [item.title, item.slug, ...(item.tags || []), item.category || '']
      .join(' ').toLowerCase();
    for (const word of text.split(/[\s\-_,\/]+/).filter(w => w.length >= 2)) {
      if (!wordIndex.has(word)) wordIndex.set(word, []);
      wordIndex.get(word).push(item.file_name);
    }
  }
  _index = wordIndex;
  return wordIndex;
}

function fallbackIcon() {
  const present = availableIcons();
  return present.has('star.png') ? 'star.png' : (present.values().next().value || 'star.png');
}

export function findIcon(query) {
  if (!query) return fallbackIcon();
  const wordIndex = getIconIndex();
  const queryWords = query.toLowerCase().split(/[\s\-_,\/]+/).filter(w => w.length >= 2);
  const scores = new Map();
  for (const qw of queryWords) {
    if (wordIndex.has(qw)) {
      for (const f of wordIndex.get(qw)) scores.set(f, (scores.get(f) || 0) + 10);
    }
    for (const [word, files] of wordIndex) {
      if (word !== qw && word.startsWith(qw) && qw.length >= 3) {
        for (const f of files) scores.set(f, (scores.get(f) || 0) + 4);
      } else if (word !== qw && qw.startsWith(word) && word.length >= 4) {
        for (const f of files) scores.set(f, (scores.get(f) || 0) + 3);
      }
    }
  }
  if (scores.size === 0) return fallbackIcon();
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
