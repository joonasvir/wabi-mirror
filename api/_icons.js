// Shared icon search utility for Vercel serverless functions
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const metaPath = join(__dirname, '..', '3d icons', 'meta.json');

let _index = null;

export function getIconIndex() {
  if (_index) return _index;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const wordIndex = new Map();
  for (const item of meta.items) {
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

export function findIcon(query) {
  if (!query) return 'star.png';
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
      }
    }
  }
  if (scores.size === 0) return 'star.png';
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
