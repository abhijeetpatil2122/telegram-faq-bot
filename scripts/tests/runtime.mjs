import assert from 'node:assert/strict';

// Admin callback hardening regression coverage.
process.env.BOT_TOKEN = 'test-token';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
process.env.ADMIN_IDS = '123,456';

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

  if (method === 'getWebhookInfo') {
    return Response.json({ ok: true, result: { url: 'https://telegram-faq-bot.vercel.app/api/telegram', pending_update_count: 0, max_connections: 40 } });
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

let response = await invoke({ update_id: 900001, message: { from: { id: 999 }, chat: { id: 42 }, text: '/start' } });
assert.equal(response.statusCode, 200);
assert.equal(response.body.ok, true);
assert.equal(calls.filter((call) => call.method === 'sendRichMessage').length, 1);

const callCountAfterFirstStart = calls.length;
response = await invoke({ update_id: 900001, message: { from: { id: 999 }, chat: { id: 42 }, text: '/start' } });
assert.equal(response.statusCode, 200);
assert.equal(response.body.ok, true);
assert.equal(calls.length, callCountAfterFirstStart, 'duplicate update must not send again');

response = await invoke({ update_id: 900002, message: { from: { id: 999 }, chat: { id: 42 }, text: '/help' } }, { 'x-telegram-bot-api-secret-token': 'wrong' });
assert.equal(response.statusCode, 401);

response = await invoke({ update_id: 900003, message: { from: { id: 999 }, chat: { id: 42 }, text: '/help' } }, undefined, '{invalid-json');
assert.equal(response.statusCode, 400);

response = await invoke({ update_id: 900004, inline_query: { id: 'inline-1', query: 'how do I make a bot', offset: '' } });
assert.equal(response.statusCode, 200);
assert.equal(response.body.ok, true);
assert.equal(answerInlineAttempts, 2, '429 must honor retry handling and retry once');

failSendRichMessage = true;
response = await invoke({ update_id: 900005, message: { from: { id: 999 }, chat: { id: 42 }, text: '/help' } });
assert.equal(response.statusCode, 500, 'failed Telegram delivery must return non-2xx so webhook delivery can be retried');
assert.equal(calls.filter((call) => call.method === 'sendRichMessage').length >= 3, true, 'retryable Telegram failures must be retried once');
failSendRichMessage = false;

response = await invoke({ update_id: 900006, message: { from: { id: 123 }, chat: { id: 42 }, text: '/admin' } });
assert.equal(response.statusCode, 200);
const adminSend = calls.findLast((call) => call.method === 'sendRichMessage');
assert.match(adminSend.payload.rich_message.html, /Admin Control Center/);
assert.match(adminSend.payload.rich_message.html, /adm:stats/);

response = await invoke({
  update_id: 900007,
  callback_query: {
    id: 'callback-1',
    from: { id: 123 },
    data: 'adm:stats',
    message: { chat: { id: 42 }, message_id: 77 }
  }
});
assert.equal(response.statusCode, 200);
const editCall = calls.findLast((call) => call.method === 'editMessageText');
assert.equal(editCall.payload.chat_id, 42);
assert.equal(editCall.payload.message_id, 77);
assert.match(editCall.payload.rich_message.html, /Knowledge Statistics/);
assert.equal(calls.filter((call) => call.method === 'answerCallbackQuery').length >= 1, true);

response = await invoke({
  update_id: 900008,
  callback_query: {
    id: 'callback-2',
    from: { id: 999 },
    data: 'adm:stats',
    message: { chat: { id: 42 }, message_id: 77 }
  }
});
assert.equal(response.statusCode, 200);
const unauthorizedAnswer = calls.findLast((call) => call.method === 'answerCallbackQuery');
assert.equal(unauthorizedAnswer.payload.show_alert, true);
assert.equal(unauthorizedAnswer.payload.text, 'Not authorized.');

console.log('Runtime tests passed: webhook hardening, idempotency, Telegram retry handling, and protected admin Rich Message navigation.');
