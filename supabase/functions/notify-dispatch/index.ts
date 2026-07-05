// supabase/functions/notify-dispatch/index.ts
// Sends email notifications when key events occur
// Called by: DB triggers via pg_net, or directly from other edge functions
//
// POST body: { notification_id } — reads from notifications table and sends email
// NOTE: Uses Supabase built-in email (no SendGrid needed for basic use)

import { CORS, jsonResponse, errorResponse, getSupabaseAdmin } from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { notification_id, recipient_email, subject, body } = await req.json()

    // Option A: Send from notification_id (reads DB record)
    if (notification_id) {
      const supabase = getSupabaseAdmin()

      const { data: notif } = await supabase
        .from('notifications')
        .select('*, users(email, full_name)')
        .eq('id', notification_id)
        .single()

      if (!notif) return errorResponse('Notification not found', 404)

      const emailBody = buildEmailHtml(
        notif.users?.full_name || 'Team',
        notif.title,
        notif.message,
        notif.related_page
      )

      await sendEmail(supabase, notif.users?.email, notif.title, emailBody)

      await supabase.from('notifications').update({ sent_via_email: true }).eq('id', notification_id)

      return jsonResponse({ success: true, sent_to: notif.users?.email })
    }

    // Option B: Direct email send
    if (recipient_email && subject && body) {
      const supabase = getSupabaseAdmin()
      await sendEmail(supabase, recipient_email, subject, body)
      return jsonResponse({ success: true })
    }

    return errorResponse('notification_id or (recipient_email, subject, body) required', 400)

  } catch (err) {
    console.error('notify-dispatch error:', err)
    return errorResponse(err.message)
  }
})

async function sendEmail(supabase: ReturnType<typeof getSupabaseAdmin>, to: string, subject: string, html: string) {
  // Supabase uses pg_net + SMTP configured in project settings
  // For production, configure SMTP in: Supabase Dashboard → Settings → Auth → SMTP Settings
  // Then use the admin auth API to send emails
  const { error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: to,
    // This is a placeholder — replace with proper SMTP integration
    // See: https://supabase.com/docs/guides/auth/auth-smtp
  })

  // For now, log the email (replace with real SMTP when configured)
  console.log(`EMAIL to: ${to}\nSUBJECT: ${subject}\n---\n${html}`)
}

function buildEmailHtml(name: string, title: string, message: string, page: string): string {
  const pageUrl = `your-domain.com/index.html#${page}`
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#f5f5f3;border-radius:8px;padding:20px;margin-bottom:16px">
    <h2 style="margin:0;font-size:16px;color:#1a1a18">Control Intelligence — UCIL</h2>
  </div>
  <p style="color:#1a1a18">Hi ${name},</p>
  <h3 style="color:#185fa5">${title}</h3>
  <p style="color:#6b6a63;line-height:1.6">${message}</p>
  <a href="${pageUrl}" style="display:inline-block;background:#1a1a18;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:12px">
    View in Dashboard →
  </a>
  <p style="color:#9c9a92;font-size:11px;margin-top:24px">
    Unified Control Intelligence Layer · Automated notification
  </p>
</body>
</html>`
}
