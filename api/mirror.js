import Anthropic from '@anthropic-ai/sdk';
import { MIRROR_PROMPTS } from './_mirror-prompts.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { history = [], version = 'concise' } = req.body;
    const SYSTEM = MIRROR_PROMPTS[version] || MIRROR_PROMPTS.concise;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Full quiz history (${history.length} questions):\n${JSON.stringify(history, null, 2)}\n\nDeliver the mirror, app suggestions, and dimension scores.`,
      }],
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
