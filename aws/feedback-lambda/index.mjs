import crypto from 'node:crypto';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,x-feedback-token',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function sanitize(s = '', max = 3000) {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, max);
}

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return json(200, { ok: true });
  try {
    const token = process.env.FEEDBACK_TOKEN;
    if (token) {
      const got = event.headers?.['x-feedback-token'] || event.headers?.['X-Feedback-Token'];
      if (!got || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token))) return json(401, { error: 'Unauthorized' });
    }

    const body = JSON.parse(event.body || '{}');
    const name = sanitize(body.name, 80);
    const email = sanitize(body.email, 120);
    const type = sanitize(body.type, 40);
    const cert = sanitize(body.cert, 40);
    const message = sanitize(body.message, 3000);
    const source = sanitize(body.source, 80);
    const page = sanitize(body.page, 500);

    if (!name || !message) return json(400, { error: 'name and message are required' });

    const text = [
      '*AWS Cert Study Portal Feedback*',
      `*Type:* ${type || 'n/a'}`,
      `*Cert:* ${cert || 'General'}`,
      `*From:* ${name}${email ? ` (${email})` : ''}`,
      `*Source:* ${source || 'web'}`,
      `*Page:* ${page || 'n/a'}`,
      '*Message:*',
      message
    ].join('\n');

    const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!slackRes.ok) {
      const t = await slackRes.text();
      console.error('Slack webhook failed', slackRes.status, t);
      return json(502, { error: 'Failed to send message to Slack' });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error' });
  }
};
