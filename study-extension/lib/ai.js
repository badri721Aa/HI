// Claude-powered study tools. Runs in the background service worker so the
// API key never touches web pages.
import Anthropic from '../vendor/anthropic.js'

const TUTOR = `You are StudyPilot, a friendly, sharp study tutor inside a student's browser.
Your job is to help the student understand and improve their own work, not to do it for them.
- Teach the idea, show a worked example on a *different* but similar problem when useful, and give hints.
- Never write a finished answer, essay, or full solution the student could hand in as their own.
- Be concise and skimmable: short paragraphs, bullet points, **bold** key terms. Use Markdown.
- Match the student's level. If something is ambiguous, state your assumption briefly.`

const TOOLS = {
  explain: {
    label: 'Explain',
    prompt: t => `Explain the concept(s) behind this so I really understand it. Include: a plain-language explanation, a short example (not the answer to my exact question), and one quick question I can use to check my understanding.\n\n"""${t}"""`,
  },
  hint: {
    label: 'Hint',
    prompt: t => `Give me a step-by-step *hint ladder* for this: 3 hints, each a little more specific than the last, but stop before the final answer.\n\n"""${t}"""`,
  },
  simplify: {
    label: 'Simplify',
    prompt: t => `Rephrase this in very simple words (like explaining to a 12-year-old), then list the 3 most important takeaways.\n\n"""${t}"""`,
  },
  summarize: {
    label: 'Summarize',
    prompt: t => `Summarize this into: a one-sentence gist, 3-6 key points, and any important terms with one-line definitions.\n\n"""${t}"""`,
  },
  define: {
    label: 'Define',
    prompt: t => `Define "${t.slice(0, 200)}" clearly: meaning, part of speech or field, a simple example sentence, synonyms, and a memory trick.`,
  },
  grammar: {
    label: 'Grammar & clarity',
    prompt: t => `Review MY writing below for grammar, spelling, punctuation, clarity and flow. Format as a numbered list where each item is: the original snippet in quotes → what's wrong → a suggested fix for that snippet only. Then give 2-3 overall tips. Do NOT rewrite the whole text, keep my voice.\n\n"""${t}"""`,
  },
  check: {
    label: 'Check my answer',
    prompt: (t, extra) => `Check MY answer to the question below.
Say whether it is ✅ correct, 🟡 partly correct, or ❌ incorrect. Point to the exact step or part that is wrong and explain why, then give a hint to fix it.
Don't write the full corrected solution, let me fix it myself.

Question:
"""${t}"""

My answer:
"""${extra || '(no answer given)'}"""`,
  },
  ask: {
    label: 'Ask',
    prompt: (t, extra) => `${extra}\n\n${t ? `Context:\n"""${t}"""` : ''}`,
  },
  plan: {
    label: 'Study plan',
    prompt: t => `Here is my current homework list (JSON). Make a realistic study plan for the next 7 days. Prioritize by deadline and size, break big tasks into sessions, include short breaks, and keep it under 200 words. Use a Markdown list grouped by day.\n\n${t}`,
  },
  flashcards: {
    label: 'Flashcards',
    prompt: t => `Make 5-10 high-quality study flashcards from this material. Front: a specific question or term. Back: a short, accurate answer (max 2 sentences).\n\n"""${t}"""`,
    schema: {
      type: 'object',
      properties: {
        deck: { type: 'string', description: 'Short deck name (2-4 words) for this topic' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: { front: { type: 'string' }, back: { type: 'string' } },
            required: ['front', 'back'],
            additionalProperties: false,
          },
        },
      },
      required: ['deck', 'cards'],
      additionalProperties: false,
    },
  },
  quiz: {
    label: 'Quiz me',
    prompt: t => `Write 4 multiple-choice practice questions that test understanding of this material (not trivia). Each has 4 options, exactly one correct, and a one-sentence explanation of why.\n\n"""${t}"""`,
    schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              q: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answer: { type: 'integer', description: 'Index (0-3) of the correct option' },
              why: { type: 'string' },
            },
            required: ['q', 'options', 'answer', 'why'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  },
}

export const TOOL_NAMES = Object.keys(TOOLS)

function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Your Claude API key was rejected. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to that model. Try another model in Settings.'
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a few seconds and try again.'
  if (e instanceof Anthropic.BadRequestError) return `Request rejected: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check your internet connection.'
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ''}: ${e.message}`
  if (e?.name === 'AbortError' || e instanceof Anthropic.APIUserAbortError) return 'Stopped.'
  return String(e?.message || e)
}

/**
 * Streams one study-tool request.
 * @param {{tool: string, text: string, extra?: string, history?: {role: string, content: string}[]}} req
 * @param {{apiKey: string, model: string, effort: string}} settings
 * @param {(delta: string) => void} onText
 * @param {AbortSignal} signal
 */
export async function runTool(req, settings, onText, signal) {
  const tool = TOOLS[req.tool]
  if (!tool) throw new Error(`Unknown tool: ${req.tool}`)
  if (!settings.apiKey) throw new Error('NO_KEY')
  const text = String(req.text || '').slice(0, 60000)

  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  const messages = [
    ...(req.history || []).slice(-8),
    { role: 'user', content: tool.prompt(text, req.extra) },
  ]
  const params = {
    model: settings.model,
    max_tokens: 8000,
    system: TUTOR,
    messages,
  }
  const outputConfig = {}
  // Haiku 4.5 doesn't take the effort setting or server-side fallbacks.
  if (settings.model !== 'claude-haiku-4-5') {
    outputConfig.effort = settings.effort || 'low'
    params.betas = ['server-side-fallback-2026-07-01']
    params.fallbacks = 'default'
  }
  if (tool.schema) outputConfig.format = { type: 'json_schema', schema: tool.schema }
  if (Object.keys(outputConfig).length) params.output_config = outputConfig

  try {
    const stream = client.beta.messages.stream(params, { signal })
    if (!tool.schema) stream.on('text', delta => onText(delta))
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try rephrasing it as a study question.')
    }
    const fullText = final.content.filter(b => b.type === 'text').map(b => b.text).join('')
    let data = null
    if (tool.schema) {
      try { data = JSON.parse(fullText) } catch { throw new Error('Claude returned an unexpected format. Please try again.') }
    }
    return {
      text: fullText,
      data,
      truncated: final.stop_reason === 'max_tokens',
      usage: { in: final.usage?.input_tokens || 0, out: final.usage?.output_tokens || 0 },
    }
  } catch (e) {
    throw new Error(e?.message === 'NO_KEY' ? 'NO_KEY' : friendlyError(e))
  }
}

export async function testKey(settings) {
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 })
  try {
    await client.models.retrieve(settings.model)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: friendlyError(e) }
  }
}
