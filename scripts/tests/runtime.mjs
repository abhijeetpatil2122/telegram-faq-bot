import assert from 'node:assert/strict';

process.env.BOT_TOKEN = 'test-token';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';

const calls = [];
let answerInlineAttempts = 0;
let failSendRichMessage = false;

globalThis.fetch = async (url, options = {}) => {
  const method = String(url).split('/').pop();
  const payload = JSON.parse(options.body ?? '{}');
  calls.push({ method, payload });

  if (method === 'getMe') {
    return Response.json({ ok: true, result: { id: 123, is_bot: true, first_name: 'TeleFQBot', username: 'TeleFQBot' } });
  }

  if (method === 'answerInlineQuery') {
    answerInlineAttempts += 1;
    if (answerInlineAttempts === 1) {
      return new Response(JSON.stringify({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry later',
        parameters: { retry_after: 0 }
      }), { status: 429, headers: { 'content-type': 'application/json' } });
    }
    return Response.json({ ok: true, result: true });
  }

  if (method === 'sendRichMessage' && failSendRichMessage) {
    return new Response(JSON.stringify({ ok: false, error_code: 500, description: 'temporary failure' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  return Response.json({ ok: true, result: true });
};

const { default: handler } = await import('../../api/telegram.js');

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function invoke(update, headers = { 'x-telegram-bot-api-secret-token': 'test-secret' }, body = update) {
  const response = makeResponse();
  await handler({ method: 'POST', headers, body }, response);
  return response;
}

let response = await invoke({ update_id: 900001, message: { chat: { id: 42 }, text: '/start' } });
assert.equal(response.statusCode, 200);
assert.equal(response.body.ok, true);
assert.equal(calls.filter((call) => call.method === 'sendRichMessage').length, 1);

const callCountAfterFirstStart = calls.length;
response = await invoke({ update_id: 900001, message: { chat: { id: 42 }, text: '/start' } });
assert.equal(response.statusCode, 200);
assert.equal(response.body.ok, true);
assert.equal(calls.length, callCountAfterFirstStart, 'duplicate update must not send again');

response = await invoke({ update_id: 900002, message: { chat: { id: 42 }, text: '/help' } }, { 'x-telegram-bot-api-secret-token': 'wrong' });
assert.equal(response.statusCode, 401);

response = await invoke({ update_id: 900003, message: { chat: { id: 42 }, text: '/help' } }, undefined, '{invalid-json');
assert.equal(response.statusCode, 400);

response = await invoke({ update_id: 900004, inline_query: { id: 'inline-1', query: 'how do I make a bot', offset: '' } });
assert.equal(response.statusCode, 200);
assert.equal(response.body.ok, true);
assert.equal(answerInlineAttempts, 2, '429 must honor retry handling and retry once');

failSendRichMessage = true;
response = await invoke({ update_id: 900005, message: { chat: { id: 42 }, text: '/help' } });
assert.equal(response.statusCode, 500, 'failed Telegram delivery must return non-2xx so webhook delivery can be retried');
assert.equal(calls.filter((call) => call.method === 'sendRichMessage').length >= 3, true, 'retryable Telegram failures must be retried once');

console.log('Runtime hardening tests passed: secret validation, malformed body handling, idempotency, 429 retry, and webhook retry semantics.');
