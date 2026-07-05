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

// ── Call Groq API (replaces Claude) ───────────────────────────
export async function callClaude(prompt: string, systemPrompt: string, maxTokens = 1500): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY')!

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',   // ✅ FIXED
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq API error ${response.status}: ${err}`) // ✅ FIXED
  }

  const data = await response.json()

  return data.choices[0].message.content   // ✅ FIXED
}

// ── Call Claude and parse JSON response ───────────────────────
export async function callClaudeJSON<T>(prompt: string, systemPrompt: string, maxTokens = 1500): Promise<T> {
  const raw = await callClaude(prompt, systemPrompt, maxTokens)
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as T
}

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
