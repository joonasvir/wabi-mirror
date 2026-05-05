import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

// Load icon metadata
const iconMeta = JSON.parse(readFileSync(join(__dirname, '3d icons/meta.json'), 'utf8'));

// Build word → file_names index for fast fuzzy icon search
const wordIndex = new Map();
for (const item of iconMeta.items) {
  const text = [item.title, item.slug, ...(item.tags || []), item.category || '']
    .join(' ')
    .toLowerCase();
  const words = text.split(/[\s\-_,\/]+/).filter(w => w.length >= 2);
  for (const word of words) {
    if (!wordIndex.has(word)) wordIndex.set(word, []);
    wordIndex.get(word).push(item.file_name);
  }
}

function findIcon(query) {
  if (!query) return 'star.png';
  const queryWords = query.toLowerCase().split(/[\s\-_,\/]+/).filter(w => w.length >= 2);
  const scores = new Map();

  for (const qw of queryWords) {
    // Exact match (highest priority)
    if (wordIndex.has(qw)) {
      for (const f of wordIndex.get(qw)) {
        scores.set(f, (scores.get(f) || 0) + 10);
      }
    }
    // Prefix match
    for (const [word, files] of wordIndex) {
      if (word !== qw && word.startsWith(qw) && qw.length >= 3) {
        for (const f of files) scores.set(f, (scores.get(f) || 0) + 4);
      } else if (word !== qw && qw.startsWith(word) && word.length >= 4) {
        for (const f of files) scores.set(f, (scores.get(f) || 0) + 3);
      }
    }
  }

  if (scores.size === 0) return 'star.png';
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Serve icons and fonts statically
app.use('/icons', express.static(join(__dirname, '3d icons/images')));
app.use('/fonts', express.static(join(__dirname, 'fonts')));
app.use(express.static(__dirname));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUESTION_SYSTEM = `You are the Wabi Mirror — a personality engine that gets to know someone through quick, fun questions. You are building a living profile of this person with every answer.

RULES:
- Generate exactly ONE question with exactly FOUR answer options.
- Questions must be casual, warm, and fun — like a curious friend, not a survey.
- Each answer must be short (2-8 words) and visually distinct (easy to represent with an icon or image).
- Never repeat a theme you've already asked about.
- Each question must go DEEPER based on what you've learned — follow the thread, don't pivot randomly.
- No multi-select. One tap, one answer.
- Never explain yourself. Just ask the question.

WHAT YOU'RE BUILDING — A PROFILE ACROSS THESE DIMENSIONS:
1. Energy — how they move through the world (pace, structure, discipline, spontaneity)
2. Identity — who they are to other people (role in friendships, what they're known for)
3. Rituals — what they do every day (habits, routines, non-negotiables)
4. Bonds — how they connect with people (social style, what they do with friends)
5. Aspirations — what they're reaching for (growth areas, goals, the life they imagine)
6. Tensions — what's underneath (fears, tradeoffs, the things they don't say out loud)

QUESTION STRATEGY BY PHASE:
- Questions 1-3: Light, behavioral, easy. Morning routines, first instincts, daily habits. Get them tapping.
- Questions 4-6: More personal. Relationships, what they do with their people, what they're working on.
- Questions 7-10: Identity-level. What they're figuring out, what scares them, what they imagine, what they'd never give up.
- Questions 11-12: The deep cut. The question that makes them pause and think "how did this app know to ask me that."

CRITICAL — FOLLOW THE THREAD:
If someone says they work out "to prove something to myself," the next question MUST pull on that thread. Do NOT pivot to unrelated topics.

OUTPUT FORMAT:
Return ONLY valid JSON — no markdown, no explanation:
{
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "icon_queries": ["1-3 word icon search for A", "icon search for B", "icon search for C", "icon search for D"],
  "internal_note": "What I'm trying to learn and why"
}

icon_queries must be concrete visual search terms (e.g. "yoga mat", "coffee cup", "newspaper", "smartphone").`;

const MIRROR_SYSTEM = `You are the Wabi Mirror. You've just spent several questions getting to know someone. Deliver three things:

1. THE MIRROR — a 2-3 sentence personality read that feels uncomfortably accurate.
- Write in second person ("You're the kind of person who...")
- Be SPECIFIC. Reference the tensions and contradictions in their answers.
- Name something they didn't explicitly say but you inferred.
- Tone: warm but direct. Screenshot-worthy.

2. THE APPS — exactly 5 app suggestions.
- Name (3 words max) + one-line "because you..." reason
- At least one addresses something they didn't say (inferred)
- At least one is social/shareable
- At least one challenges them or pushes outside their pattern

3. DIMENSIONS — rate this person on 5 dimensions (0.0 to 1.0 each):
- energy: how high-energy/driven they are
- identity: how defined/clear their self-concept is
- rituals: how structured/habitual they are
- bonds: how socially connected/warm they are
- aspirations: how ambitious/growth-oriented they are

OUTPUT FORMAT:
Return ONLY valid JSON — no markdown, no explanation:
{
  "mirror": "The 2-3 sentence personality read",
  "apps": [
    {"name": "App Name", "reason": "Because you..."},
    {"name": "App Name", "reason": "Because you..."},
    {"name": "App Name", "reason": "Because you..."},
    {"name": "App Name", "reason": "Because you..."},
    {"name": "App Name", "reason": "Because you..."}
  ],
  "dimensions": {
    "energy": 0.75,
    "identity": 0.60,
    "rituals": 0.85,
    "bonds": 0.50,
    "aspirations": 0.70
  }
}`;

app.post('/api/question', async (req, res) => {
  try {
    const { history = [] } = req.body;
    const questionNumber = history.length + 1;
    // Haiku for speed on Q1-5, Sonnet for depth on Q6+
    const model = questionNumber <= 5
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-6';

    const userContent = history.length === 0
      ? 'Start the quiz. Generate the first question.'
      : `Quiz history so far (${history.length} questions answered):\n${JSON.stringify(history, null, 2)}\n\nGenerate question ${questionNumber}.`;

    const response = await client.messages.create({
      model,
      max_tokens: 600,
      system: QUESTION_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = response.content[0].text.trim();
    const json = JSON.parse(raw);

    // Find best icon for each option using icon_queries from Claude
    const icons = (json.icon_queries || json.options).map(q => findIcon(q));

    res.json({
      question: json.question,
      options: json.options,
      icons,
    });
  } catch (err) {
    console.error('/api/question error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mirror', async (req, res) => {
  try {
    const { history = [] } = req.body;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: MIRROR_SYSTEM,
      messages: [{
        role: 'user',
        content: `Full quiz history (${history.length} questions):\n${JSON.stringify(history, null, 2)}\n\nDeliver the mirror, app suggestions, and dimension scores.`,
      }],
    });

    const raw = response.content[0].text.trim();
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error('/api/mirror error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Icon search endpoint for debugging
app.get('/api/icons/search', (req, res) => {
  const q = req.query.q || '';
  res.json({ icon: findIcon(q) });
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Wabi Mirror → http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY not set — add it to .env');
  }
});
