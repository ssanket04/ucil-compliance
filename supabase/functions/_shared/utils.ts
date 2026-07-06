// supabase/functions/_shared/utils.ts
// Shared across all Edge Functions — import from here

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Supabase admin client (bypasses RLS) ─────────────────────
export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
}

// ── Load active AI prompt from database (5-minute TTL cache) ──
const _promptCache = new Map<string, { prompt: string; fetchedAt: number }>()

export async function getActivePrompt(functionName: string, fallback: string): Promise<string> {
  const cached = _promptCache.get(functionName);
  if (cached && (Date.now() - cached.fetchedAt < 300000)) { // 5 minutes
    return cached.prompt;
  }
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('ai_prompts')
      .select('prompt_text')
      .eq('function_name', functionName)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const prompt = data?.prompt_text || fallback
    _promptCache.set(functionName, { prompt, fetchedAt: Date.now() })
    return prompt
  } catch {
    return fallback
  }
}

// ── Call Groq API (replaces old Claude backend) ────────────────
export async function callAI(prompt: string, systemPrompt: string, maxTokens = 1500): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY')!

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('Groq API returned an unexpected response shape (no message content)')
  }
  return content
}

// ── Call AI and parse JSON response ───────────────────────────
export async function callAIJSON<T>(prompt: string, systemPrompt: string, maxTokens = 1500): Promise<T> {
  const raw = await callAI(prompt, systemPrompt, maxTokens)
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Models sometimes wrap JSON in prose ("Here is the JSON: …").
    // Extract the first balanced-looking {...} block and retry.
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch { /* fall through */ }
    }
    throw new Error('AI_UNAVAILABLE: could not parse AI JSON response')
  }
}

// @deprecated Use callAI instead
export const callClaude = callAI;

// @deprecated Use callAIJSON instead
export const callClaudeJSON = callAIJSON;

// ── CORS headers for browser calls ───────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Standard JSON response ────────────────────────────────────
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Error response ────────────────────────────────────────────
export function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status)
}

// ── Send notification to a user ───────────────────────────────
export async function sendNotification(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  recipientId: string,
  triggerEvent: string,
  title: string,
  message: string,
  relatedPage: string,
  relatedId?: string
) {
  await supabase.from('notifications').insert({
    recipient_id:  recipientId,
    trigger_event: triggerEvent,
    title,
    message,
    related_page:  relatedPage,
    related_id:    relatedId || null,
    is_read:       false,
  })
}
