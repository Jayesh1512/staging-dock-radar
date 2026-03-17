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

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKeyRaw = process.env.GEMINI_API_KEY;
  if (!apiKeyRaw) throw new Error('GEMINI_API_KEY is not set in environment');

  const apiKeys = apiKeyRaw.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) throw new Error('GEMINI_API_KEY is empty');

  let lastError: any = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: PROVIDER_MODELS.gemini,
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(userPrompt);
      return result.response.text();
    } catch (err: any) {
      lastError = err;
      
      // Check for rate limit error (429)
      const errorText = String(err.message || err.stack || '');
      const isRateLimit = 
        errorText.includes('429') || 
        errorText.includes('Too Many Requests') || 
        err.status === 429 ||
        err.statusCode === 429;

      if (isRateLimit && i < apiKeys.length - 1) {
        console.warn(`[llm] Gemini key ${i + 1}/${apiKeys.length} rate limited. Rotating to next key...`);
        continue;
      }
      
      // For non-rate-limit errors or if it's the last key, re-throw
      throw err;
    }
  }

  throw lastError || new Error('All Gemini API keys failed');
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

  return response.choices[0].message.content ?? '';
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
