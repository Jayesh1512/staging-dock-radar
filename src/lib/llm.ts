/**
 * Multi-provider LLM abstraction for Dock Radar scoring.
 *
 * Supported providers:
 *   gemini  — Google Gemini 2.5 Flash (DEFAULT, primary)
 *   openai  — OpenAI GPT-4o
 *   claude  — Anthropic Claude Sonnet 4.6
 *
 * Select provider via LLM_PROVIDER env var (defaults to 'gemini').
 * Each provider returns a JSON string — caller is responsible for parsing.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type LLMProvider = 'gemini' | 'openai' | 'claude';

export const PROVIDER_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-6',
};

function getActiveProvider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  if (p === 'openai') return 'openai';
  if (p === 'claude') return 'claude';
  return 'gemini';
}

// ─── Provider implementations ─────────────────────────────────────────────────

const GEMINI_503_MAX_RETRIES = 3;
const GEMINI_503_RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKeyRaw = process.env.GEMINI_API_KEY;
  if (!apiKeyRaw) throw new Error('GEMINI_API_KEY is not set in environment');

  const apiKeys = apiKeyRaw.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) throw new Error('GEMINI_API_KEY is empty');

  let lastError: any = null;

  // Outer loop: key rotation (for 429 rate limits)
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const apiKey = apiKeys[keyIdx];

    // Inner loop: retry same key (for 503 service unavailable)
    for (let retryAttempt = 0; retryAttempt <= GEMINI_503_MAX_RETRIES; retryAttempt++) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: PROVIDER_MODELS.gemini,
          systemInstruction: systemPrompt,
          generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await model.generateContent(userPrompt);
        return result.response.text();
      } catch (err: any) {
        lastError = err;
        const errorText = String(err.message || err.stack || '');

        const isRateLimit =
          errorText.includes('429') ||
          errorText.includes('Too Many Requests') ||
          err.status === 429 ||
          err.statusCode === 429;

        const isServiceUnavailable =
          errorText.includes('503') ||
          errorText.includes('Service Unavailable') ||
          errorText.includes('overloaded') ||
          errorText.includes('high demand') ||
          err.status === 503 ||
          err.statusCode === 503;

        if (isRateLimit) {
          // Rotate to next key
          console.warn(`[llm] Gemini key ${keyIdx + 1}/${apiKeys.length} rate limited (429). Rotating...`);
          break; // break inner retry loop → continue outer key loop
        }

        if (isServiceUnavailable && retryAttempt < GEMINI_503_MAX_RETRIES) {
          const delay = GEMINI_503_RETRY_DELAYS_MS[retryAttempt];
          console.warn(`[llm] Gemini 503 on key ${keyIdx + 1} (attempt ${retryAttempt + 1}/${GEMINI_503_MAX_RETRIES}). Retrying in ${delay / 1000}s…`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // retry same key
        }

        // All other errors or retries exhausted: throw
        throw err;
      }
    }
  }

  throw lastError || new Error('All Gemini API keys exhausted');
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in environment');

  const client = new OpenAI({ apiKey, timeout: 60_000 });
  const response = await client.chat.completions.create({
    model: PROVIDER_MODELS.openai,
    max_tokens: 16384,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content ?? '';
  if (content.length < 10) {
    console.warn(`[llm] OpenAI response suspiciously short (${content.length} chars). finish_reason=${response.choices[0].finish_reason}, tokens=${response.usage?.completion_tokens}`);
  }
  return content;
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in environment');

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: PROVIDER_MODELS.claude,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a prompt through the active LLM provider.
 * Returns raw text — expected to be valid JSON for scoring use cases.
 *
 * @param systemPrompt - Instruction/persona prompt
 * @param userPrompt   - Per-request content (article data for scoring)
 */
export async function llmComplete(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const provider = getActiveProvider();
  switch (provider) {
    case 'openai': return callOpenAI(systemPrompt, userPrompt);
    case 'claude': return callClaude(systemPrompt, userPrompt);
    case 'gemini': return callGemini(systemPrompt, userPrompt);
  }
}

/** Returns which provider + model is currently active (useful for logging) */
export function getActiveLLMInfo(): { provider: LLMProvider; model: string } {
  const provider = getActiveProvider();
  return { provider, model: PROVIDER_MODELS[provider] };
}
