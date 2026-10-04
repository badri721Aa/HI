// Claude client for Master Mind (official Anthropic SDK, bundled in vendor/).
// Import from extension pages and the service worker only, never from content scripts,
// so the API key stays inside the extension origin. Content scripts use the 'mm-ai' port.
import Anthropic from '../vendor/anthropic.js'
import { getSettings, getApiKey } from './store.js'
import { TASKS } from './tasks.js'

export class AIError extends Error {
  /** @param {'NO_KEY'|'AUTH'|'PERMISSION'|'RATE'|'NETWORK'|'REFUSAL'|'FORMAT'|'ABORT'|'BAD_REQUEST'|'API'} code */
  constructor(code, message) { super(message); this.code = code }
}

function toAIError(e) {
  if (e instanceof AIError) return e
  if (e instanceof Anthropic.APIUserAbortError || e?.name === 'AbortError') return new AIError('ABORT', 'Stopped.')
  if (e instanceof Anthropic.AuthenticationError) return new AIError('AUTH', 'Your Claude API key was rejected. Update it in Settings.')
  if (e instanceof Anthropic.PermissionDeniedError) return new AIError('PERMISSION', 'This API key cannot use that model or tool. Try another model in Settings.')
  if (e instanceof Anthropic.RateLimitError) return new AIError('RATE', 'Rate limited by the Claude API. Wait a moment and try again.')
  if (e instanceof Anthropic.BadRequestError) return new AIError('BAD_REQUEST', `Request rejected: ${e.message}`)
  if (e instanceof Anthropic.APIConnectionError) return new AIError('NETWORK', 'Could not reach the Claude API. Check your connection.')
  if (e instanceof Anthropic.APIError) return new AIError('API', `Claude API error ${e.status ?? ''}: ${e.message}`)
  return new AIError('API', String(e?.message || e))
}

/**
 * Run a named task from lib/tasks.js.
 * @param {string} name
 * @param {object} input
 * @param {{ onText?: (delta: string) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ text: string, data: any, sources: {url: string, title: string}[], truncated: boolean, usage: {input: number, output: number} }>}
 */
export async function runTask(name, input, { onText, signal } = {}) {
  const task = TASKS[name]
  if (!task) throw new AIError('BAD_REQUEST', `Unknown task "${name}"`)
  const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()])
  if (!apiKey) throw new AIError('NO_KEY', 'Add your Claude API key in Master Mind settings to use AI features.')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  const model = settings.model
  const isHaiku = model === 'claude-haiku-4-5'
  const messages = task.messages(input)
  const params = { model, max_tokens: task.maxTokens || 8000, system: task.system, messages }

  const outputConfig = {}
  if (!isHaiku) {
    outputConfig.effort = settings.effort || 'low'
    // Server-side refusal fallbacks; Haiku 4.5 doesn't take them.
    params.betas = ['server-side-fallback-2026-07-01']
    params.fallbacks = 'default'
  }
  if (task.schema) outputConfig.format = { type: 'json_schema', schema: task.schema }
  if (Object.keys(outputConfig).length) params.output_config = outputConfig
  if (task.webSearch) {
    params.tools = [{ type: isHaiku ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: settings.factCheckSearches || 5 }]
  }

  let text = ''
  const sources = new Map()
  let usage = { input: 0, output: 0 }
  let final
  try {
    // Server tools can pause a long turn; resume by sending the paused assistant turn back.
    for (let round = 0; round < 4; round++) {
      const stream = client.beta.messages.stream(params, { signal })
      if (onText && !task.schema) stream.on('text', d => onText(d))
      final = await stream.finalMessage()
      usage = { input: usage.input + (final.usage?.input_tokens || 0), output: usage.output + (final.usage?.output_tokens || 0) }
      for (const b of final.content) {
        if (b.type === 'text') {
          text += b.text
          for (const c of b.citations || []) if (c.url) sources.set(c.url, { url: c.url, title: c.title || c.url })
        } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const r of b.content) if (r.url && !sources.has(r.url)) sources.set(r.url, { url: r.url, title: r.title || r.url })
        }
      }
      if (final.stop_reason !== 'pause_turn') break
      params.messages = [...params.messages, { role: 'assistant', content: final.content }]
    }
  } catch (e) {
    throw toAIError(e)
  }

  if (final.stop_reason === 'refusal') throw new AIError('REFUSAL', 'Claude declined this request.')
  let data = null
  if (task.schema) {
    try { data = JSON.parse(text) } catch { throw new AIError('FORMAT', 'Claude returned an unexpected format. Try again.') }
  }
  return { text, data, sources: [...sources.values()], truncated: final.stop_reason === 'max_tokens', usage }
}

/** Verify the stored (or given) key against the selected model. */
export async function testKey(apiKey) {
  const settings = await getSettings()
  const key = apiKey ?? await getApiKey()
  if (!key) return { ok: false, error: 'No API key yet.' }
  try {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 })
    await client.models.retrieve(settings.model)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: toAIError(e).message }
  }
}
