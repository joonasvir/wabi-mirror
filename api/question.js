import Anthropic from '@anthropic-ai/sdk';
import { findIcon } from './_icons.js';
import { QUESTION_PROMPTS } from './_question-prompts.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { history = [], version = 'concise' } = req.body;
    const SYSTEM = QUESTION_PROMPTS[version] || QUESTION_PROMPTS.concise;
    const questionNumber = history.length + 1;
    const model = questionNumber <= 5
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-6';

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent = history.length === 0
      ? 'Start the quiz. Generate the first question.'
      : `Quiz history (${history.length} questions answered):\n${JSON.stringify(history, null, 2)}\n\nGenerate question ${questionNumber}.`;

    const response = await client.messages.create({
      model,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const json = JSON.parse(raw);
    const icons = (json.icon_queries || json.options).map(q => findIcon(q));

    res.json({ question: json.question, options: json.options, icons });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
