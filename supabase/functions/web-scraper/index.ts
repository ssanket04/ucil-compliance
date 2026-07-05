// supabase/functions/web-scraper/index.ts
// Scheduled function — runs daily at 08:00 IST
// Scrapes RBI, PCI SSC, ISO, SEBI for new circulars
// Triggers regulatory-impact analysis when new content is found
//
// Invoked by: Supabase Cron (see cron setup in docs)
// POST body: {} (no body needed — cron invokes with empty body)

import { CORS, jsonResponse, errorResponse, getSupabaseAdmin, sendNotification } from '../_shared/utils.ts'

// Sources to monitor
const SOURCES = [
  {
    name: 'RBI',
    url: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',
    selector: 'press release',
  },
  {
    name: 'PCI SSC',
    url: 'https://www.pcisecuritystandards.org/news/',
    selector: 'news',
  },
]

async function fetchPageText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ComplianceBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return ''
    const html = await response.text()
    // Strip HTML tags for basic text extraction
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 5000)
  } catch {
    return ''
  }
}

function extractCircularIds(text: string): string[] {
  // Extract RBI-style circular references like RBI/2024-25/112
  const rbiPattern = /RBI\/\d{4}-\d{2,4}\/\d+/g
  const matches = text.match(rbiPattern) || []
  return [...new Set(matches)]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = getSupabaseAdmin()
  const results: Array<{ source: string; status: string; newItems: number }> = []
  let totalNew = 0

  try {
    // 1. Update scan_info to show scraper is running
    await supabase.from('scan_info').upsert({
      scan_type:  'circular_scan',
      status:     'running',
      started_at: new Date().toISOString(),
    }, { onConflict: 'scan_type' })

    // 2. Fetch existing circular IDs to check for duplicates
    const { data: existing } = await supabase
      .from('regulatory_changes')
      .select('circular_id')

    const existingIds = new Set((existing || []).map((r: { circular_id: string }) => r.circular_id))

    // 3. Scrape each source
    for (const source of SOURCES) {
      try {
        const pageText = await fetchPageText(source.url)
        if (!pageText) {
          results.push({ source: source.name, status: 'fetch_failed', newItems: 0 })
          continue
        }

        // Extract circular IDs found on the page
        const foundIds = extractCircularIds(pageText)
        const newIds = foundIds.filter(id => !existingIds.has(id))

        for (const circularId of newIds) {
          // Insert new regulatory change
          const { data: newReg } = await supabase
            .from('regulatory_changes')
            .insert({
              circular_id:  circularId,
              title:        `New circular detected: ${circularId}`,
              issuer:       source.name,
              issued_date:  new Date().toISOString().split('T')[0],
              status:       'Active',
              detected_by:  'Web Scraper',
              total_impacted: 0,
            })
            .select()
            .single()

          if (newReg) {
            // Trigger impact analysis for the new circular
            try {
              const edgeFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/regulatory-impact`
              await fetch(edgeFnUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({ regulatory_change_id: newReg.id }),
              })
            } catch (triggerErr) {
              console.error('Failed to trigger regulatory-impact:', triggerErr)
            }

            totalNew++
          }
        }

        results.push({ source: source.name, status: 'ok', newItems: newIds.length })

      } catch (sourceErr) {
        console.error(`Scraper error for ${source.name}:`, sourceErr)
        results.push({ source: source.name, status: 'error', newItems: 0 })
      }
    }

    // 4. Update scan_info with completion
    await supabase.from('scan_info').upsert({
      scan_type:            'circular_scan',
      status:               'up-to-date',
      completed_at:         new Date().toISOString(),
      next_scheduled_at:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      new_items_found:      totalNew,
    }, { onConflict: 'scan_type' })

    // 5. Notify if new items found
    if (totalNew > 0) {
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .in('role', ['Compliance Lead', 'CISO'])

      for (const admin of (admins || [])) {
        await sendNotification(
          supabase,
          admin.id,
          'Regulatory update detected',
          `${totalNew} new circular(s) detected`,
          `Web scraper found ${totalNew} new regulatory update(s). Impact analysis has been triggered automatically.`,
          'regulatory'
        )
      }
    }

    return jsonResponse({ success: true, totalNew, results })

  } catch (err) {
    // Mark scan as failed
    await supabase.from('scan_info').upsert({
      scan_type:     'circular_scan',
      status:        'failed',
      completed_at:  new Date().toISOString(),
      error_message: err.message,
    }, { onConflict: 'scan_type' })

    console.error('web-scraper error:', err)
    return errorResponse(err.message)
  }
})
