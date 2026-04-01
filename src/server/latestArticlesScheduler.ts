import { loadLatestArticlesScheduleConfig, saveLatestArticlesScheduleConfig, computeNextRunAt } from './latestArticlesScheduleStore';
import { runLatestArticlesFlow } from './runLatestArticlesFlow';
import type { LatestArticlesScheduleConfig } from './latestArticlesScheduleStore';
import type { ArticleWithScore } from '@/lib/types';
import { CORE_8_REGIONS } from '@/lib/constants';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

/** Format a single article as a Slack mrkdwn message */
function formatSlackArticle(r: ArticleWithScore): string {
  const s = r.scored;
  const a = r.article;
  const url = a.resolved_url || a.url;
  const source = a.source === 'linkedin' ? 'LinkedIn' : 'Google News';
  const company = s.company || '—';
  const city = s.city || null;
  const country = s.country || null;
  const location = city && country ? `${city}, ${country}` : city || country || '—';
  const signal = s.signal_type || 'OTHER';
  const date = a.published_at
    ? new Date(a.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '—';
  // Use English summary as headline (title may be non-English from LinkedIn)
  const headline = s.summary ? s.summary.slice(0, 150) : a.title.slice(0, 120);

  return [
    `*${headline}*`,
    ``,
    `*Company:* ${company}`,
    `*Location:* ${location}`,
    `*Signal:* ${signal} · *Source:* ${source} · *Date:* ${date}`,
    ``,
    `<${url}|View Article ↗>`,
  ].filter(line => line !== null).join('\n');
}

/** Post individual articles to Slack channel with rate-limit-safe delays */
async function postArticlesToSlack(qualified: ArticleWithScore[]) {
  dotenv.config({ override: true });

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  const autoPost = process.env.SLACK_AUTO_POST;

  if (!token || !channel) return;
  if (autoPost !== 'true') {
    console.log('[latest-articles-scheduler] SLACK_AUTO_POST not enabled, skipping Slack posts');
    return;
  }
  if (qualified.length === 0) return;

  // Sort highest score first
  const sorted = [...qualified].sort((a, b) => b.scored.relevance_score - a.scored.relevance_score);

  let posted = 0;
  for (const r of sorted) {
    const message = formatSlackArticle(r);
    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, text: message, unfurl_links: true, unfurl_media: true }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        posted++;
      } else {
        console.warn(`[latest-articles-scheduler] Slack post failed: ${data.error}`);
      }
    } catch (err) {
      console.warn('[latest-articles-scheduler] Slack post error:', err instanceof Error ? err.message : err);
    }
    // 2s delay between messages to respect Slack rate limits
    if (sorted.indexOf(r) < sorted.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  console.log(`[latest-articles-scheduler] Slack: posted ${posted}/${sorted.length} articles`);
}

type SchedulerState = {
  started: boolean;
  running: boolean;
  timer: NodeJS.Timeout | null;
};

const SCHEDULER_POLL_MS = 15_000;

async function notifyCronRunByEmail(subject: string, html: string, text?: string) {
  dotenv.config({ override: true });

  const host = process.env.EMAIL_SMTP_HOST;
  const portRaw = process.env.EMAIL_SMTP_PORT;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  const from = process.env.EMAIL_SMTP_FROM;
  const to = process.env.LATEST_ARTICLES_CRON_EMAIL_TO;

  if (!host || !portRaw || !user || !pass || !from || !to) return;

  const port = Number(portRaw);
  if (Number.isNaN(port)) {
    console.error('[latest-articles-scheduler] Invalid EMAIL_SMTP_PORT value');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text: text ?? '' });
    console.log('[latest-articles-scheduler] Email notification sent', {
      to, subject, messageId: info.messageId,
    });
  } catch (err) {
    console.error('[latest-articles-scheduler] Email notification error:', err);
  }
}

/** Build HTML email digest with scored articles table */
function buildDigestHtml(
  result: { googleCount: number; linkedinCount: number; mergedCount: number; scoredCount: number; qualifiedCount: number; qualified: ArticleWithScore[] },
  config: LatestArticlesScheduleConfig,
  nextRunAt: string,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'Asia/Kolkata' });

  const articles = result.qualified
    .sort((a, b) => b.scored.relevance_score - a.scored.relevance_score);

  const articleRows = articles.map(r => {
    const s = r.scored;
    const a = r.article;
    const url = a.resolved_url || a.url;
    const source = a.source === 'linkedin' ? 'LI' : 'GN';
    const sourceBg = a.source === 'linkedin' ? '#DBEAFE' : '#D1FAE5';
    const sourceColor = a.source === 'linkedin' ? '#1D4ED8' : '#059669';
    const scoreBg = s.relevance_score >= 75 ? '#D1FAE5' : s.relevance_score >= 50 ? '#DBEAFE' : '#FEF3C7';
    const scoreColor = s.relevance_score >= 75 ? '#059669' : s.relevance_score >= 50 ? '#1D4ED8' : '#D97706';
    const pubDate = a.published_at ? new Date(a.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '—';
    const title = a.title.length > 90 ? a.title.slice(0, 87) + '…' : a.title;
    const company = s.company || '—';
    const country = s.country || '—';
    const signal = s.signal_type || 'OTHER';

    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #F3F4F6;text-align:center;">
        <span style="display:inline-block;font-weight:700;font-size:14px;padding:2px 8px;border-radius:4px;background:${scoreBg};color:${scoreColor};">${s.relevance_score}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #F3F4F6;">
        <a href="${url}" style="color:#111827;text-decoration:none;font-weight:500;font-size:13px;line-height:1.3;">${title}</a>
        <div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${a.publisher || '—'} · ${pubDate}</div>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;font-weight:600;color:#374151;">${company}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;color:#6B7280;">${country}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F3F4F6;font-size:11px;color:#6B7280;">${signal}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F3F4F6;text-align:center;">
        <span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${sourceBg};color:${sourceColor};">${source}</span>
      </td>
    </tr>`;
  }).join('\n');

  const noResultsRow = articles.length === 0
    ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px;">No qualifying articles found in this run. All collected articles scored below threshold or were duplicates.</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:20px 24px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:32px;height:32px;border-radius:8px;background:#2C7BF2;color:#fff;font-weight:700;font-size:12px;text-align:center;line-height:32px;">DR</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:#111827;">Dock Radar Daily Digest</div>
        <div style="font-size:12px;color:#6B7280;">${dateStr} · ${timeStr}</div>
      </div>
    </div>
  </div>

  <!-- Pipeline Stats -->
  <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:16px 24px;margin-bottom:16px;">
    <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Collection Summary</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;">Google News fetched</td>
        <td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;text-align:right;">${result.googleCount}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;">LinkedIn fetched</td>
        <td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;text-align:right;">${result.linkedinCount}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;">Merged unique</td>
        <td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;text-align:right;">${result.mergedCount}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;">Scored by AI</td>
        <td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;text-align:right;">${result.scoredCount}</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB;">
        <td style="padding:8px 0 0;font-size:13px;font-weight:600;color:#059669;">Qualified (score ≥ ${config.minScore ?? 50})</td>
        <td style="padding:8px 0 0;font-size:16px;font-weight:700;color:#059669;text-align:right;">${result.qualifiedCount}</td>
      </tr>
    </table>
  </div>

  <!-- Articles Table -->
  <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;margin-bottom:16px;">
    <div style="padding:16px 24px;border-bottom:1px solid #E5E7EB;">
      <div style="font-size:14px;font-weight:700;color:#111827;">Today's DJI Dock Signals</div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${articles.length} article${articles.length !== 1 ? 's' : ''} above threshold · sorted by score</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#F9FAFB;">
          <th style="padding:8px 10px;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;text-align:center;border-bottom:1px solid #E5E7EB;">Score</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;text-align:left;border-bottom:1px solid #E5E7EB;">Article</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;text-align:left;border-bottom:1px solid #E5E7EB;">Company</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;text-align:left;border-bottom:1px solid #E5E7EB;">Country</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;text-align:left;border-bottom:1px solid #E5E7EB;">Signal</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;text-align:center;border-bottom:1px solid #E5E7EB;">Src</th>
        </tr>
      </thead>
      <tbody>
        ${articleRows}
        ${noResultsRow}
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:12px;font-size:11px;color:#9CA3AF;">
    Next scheduled run: ${new Date(nextRunAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
    · Keyword: DJI Dock · Regions: ${CORE_8_REGIONS.length}
    <br>Dock Radar · FlytBase
  </div>

</div>
</body>
</html>`;
}

function getGlobalState(): SchedulerState {
  const g = globalThis as unknown as { __latestArticlesScheduler?: SchedulerState };
  if (!g.__latestArticlesScheduler) {
    g.__latestArticlesScheduler = {
      started: false,
      running: false,
      timer: null,
    };
  }
  return g.__latestArticlesScheduler;
}

async function tick() {
  const state = getGlobalState();
  if (state.running) return;

  const config = await loadLatestArticlesScheduleConfig();
  if (!config.enabled) return;

  const dueAt = config.nextRunAt ? new Date(config.nextRunAt).getTime() : null;
  if (dueAt == null || Number.isNaN(dueAt)) {
    const recomputed = { ...config, nextRunAt: computeNextRunAt(config.timeOfDay, new Date()) };
    await saveLatestArticlesScheduleConfig(recomputed);
    return;
  }

  if (Date.now() < dueAt) return;

  state.running = true;

  try {
    const runningConfig: LatestArticlesScheduleConfig = { ...config, lastStatus: 'running' };
    await saveLatestArticlesScheduleConfig(runningConfig);
    console.log('[latest-articles-scheduler] Triggering scheduled run at', new Date().toISOString());
    const result = await runLatestArticlesFlow(runningConfig);

    const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
    await saveLatestArticlesScheduleConfig({
      ...config,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'success',
      nextRunAt,
    });

    const subject = result.qualifiedCount > 0
      ? `Dock Radar | ${result.qualifiedCount} new signal${result.qualifiedCount !== 1 ? 's' : ''} today`
      : 'Dock Radar | No new signals today';
    const html = buildDigestHtml(result, runningConfig, nextRunAt);

    await notifyCronRunByEmail(subject, html);

    // Post individual articles to Slack
    await postArticlesToSlack(result.qualified);
  } catch (err) {
    console.error('[latest-articles-scheduler] Scheduled run failed:', err);
    const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
    await saveLatestArticlesScheduleConfig({
      ...config,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'failed',
      nextRunAt,
    });
    const message = err instanceof Error ? err.message : 'Unknown error';

    const failSubject = 'Dock Radar | Cron FAILED';
    const failHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:12px;border:1px solid #FECACA;padding:20px 24px;">
    <div style="font-size:16px;font-weight:700;color:#DC2626;margin-bottom:8px;">Scheduled Run Failed</div>
    <div style="font-size:13px;color:#374151;margin-bottom:12px;">${new Date().toISOString()}</div>
    <div style="background:#FEF2F2;padding:12px;border-radius:8px;font-size:13px;color:#991B1B;font-family:monospace;white-space:pre-wrap;">${String(message)}</div>
    <div style="margin-top:12px;font-size:11px;color:#9CA3AF;">Next retry: ${nextRunAt}</div>
  </div>
</div></body></html>`;

    await notifyCronRunByEmail(failSubject, failHtml);
  } finally {
    state.running = false;
  }
}

export function ensureLatestArticlesSchedulerStarted() {
  const state = getGlobalState();
  if (state.started) return;
  state.started = true;

  // Do not run immediately on server start.
  // If `nextRunAt` is already in the past (e.g. server restarted after the scheduled time),
  // advance it to the next scheduled time so we don't "catch up" unexpectedly.
  void (async () => {
    try {
      const config = await loadLatestArticlesScheduleConfig();
      if (!config.enabled) return;
      if (!config.nextRunAt) return;
      const dueAt = new Date(config.nextRunAt).getTime();
      if (Number.isNaN(dueAt)) return;
      if (Date.now() >= dueAt) {
        const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
        await saveLatestArticlesScheduleConfig({ ...config, nextRunAt });
        console.log('[latest-articles-scheduler] Startup advanced nextRunAt to', nextRunAt);
      }
    } catch (e) {
      console.error('[latest-articles-scheduler] Startup init failed:', e);
    }
  })();

  state.timer = setInterval(() => {
    void tick().catch((e) => console.error('[latest-articles-scheduler] tick failed:', e));
  }, SCHEDULER_POLL_MS);
}

