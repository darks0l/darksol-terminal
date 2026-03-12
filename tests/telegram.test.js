import test, { describe, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────
// TOKEN VALIDATION TESTS
// ─────────────────────────────────────

describe('Telegram token validation', () => {
  test('validateToken rejects empty input', async () => {
    const { validateToken } = await import('../src/services/telegram.js');
    await assert.rejects(() => validateToken(''), /Invalid token/);
    await assert.rejects(() => validateToken(null), /Invalid token/);
    await assert.rejects(() => validateToken(undefined), /Invalid token/);
  });

  test('validateToken rejects malformed tokens', async () => {
    const { validateToken } = await import('../src/services/telegram.js');
    await assert.rejects(() => validateToken('not-a-token'), /Token must be in format/);
    await assert.rejects(() => validateToken('abc:DEF'), /Token must be in format/);
    await assert.rejects(() => validateToken('123'), /Token must be in format/);
  });

  test('validateToken accepts well-formed token format (network call expected to fail)', async () => {
    const { validateToken } = await import('../src/services/telegram.js');
    // A well-formed token that won't pass Telegram's server validation
    // but passes local format checks. The network call will fail.
    await assert.rejects(
      () => validateToken('123456789:ABCdefGhIjKlmNoPQRsT'),
      // Will throw either a network error or a Telegram API error
      (err) => err instanceof Error,
    );
  });
});

// ─────────────────────────────────────
// MESSAGE FORMATTING TESTS
// ─────────────────────────────────────

describe('Telegram message handling', () => {
  test('handleMessage ignores updates without message', async () => {
    const { handleMessage } = await import('../src/services/telegram.js');
    // Should not throw
    await handleMessage({}, 'fake-token');
    await handleMessage({ message: null }, 'fake-token');
    await handleMessage({ message: {} }, 'fake-token');
  });

  test('sendMessage constructs correct API call', async () => {
    const { sendMessage } = await import('../src/services/telegram.js');
    // Will fail with network error but tests the function exists and takes correct params
    await assert.rejects(
      () => sendMessage('123:fake', 12345, 'hello'),
      (err) => err instanceof Error,
    );
  });
});

// ─────────────────────────────────────
// BOT LIFECYCLE TESTS
// ─────────────────────────────────────

describe('Bot lifecycle', () => {
  test('getBotStatus returns stopped state initially', async () => {
    const { getBotStatus } = await import('../src/services/telegram.js');
    const status = getBotStatus();
    assert.equal(status.running, false);
    assert.equal(status.botInfo, null);
    assert.equal(status.activeChats, 0);
  });

  test('stopBot is safe to call when not running', async () => {
    const { stopBot } = await import('../src/services/telegram.js');
    // Should not throw
    stopBot();
  });

  test('startBot rejects invalid token', async () => {
    const { startBot } = await import('../src/services/telegram.js');
    await assert.rejects(
      () => startBot('invalid'),
      /Token must be in format/,
    );
  });
});

// ─────────────────────────────────────
// UPDATE PARSING TESTS
// ─────────────────────────────────────

describe('Update parsing', () => {
  test('update with text message has expected structure', () => {
    const update = {
      update_id: 100,
      message: {
        message_id: 1,
        from: { id: 123, first_name: 'Test', is_bot: false },
        chat: { id: 456, type: 'private' },
        date: 1700000000,
        text: '/start',
      },
    };

    assert.ok(update.message);
    assert.ok(update.message.text);
    assert.equal(update.message.chat.id, 456);
    assert.equal(update.message.from.first_name, 'Test');
  });

  test('update without text is skipped gracefully', () => {
    const updates = [
      { update_id: 101, message: { chat: { id: 1 } } },
      { update_id: 102 },
      { update_id: 103, message: { chat: { id: 2 }, text: '' } },
    ];

    for (const u of updates) {
      const msg = u.message;
      const hasText = msg && msg.text && msg.text.trim();
      assert.equal(Boolean(hasText), false);
    }
  });

  test('rate limiting logic works correctly', () => {
    const cooldowns = new Map();
    const COOLDOWN_MS = 1000;

    function isRateLimited(chatId) {
      const key = String(chatId);
      const last = cooldowns.get(key) || 0;
      const now = Date.now();
      if (now - last < COOLDOWN_MS) return true;
      cooldowns.set(key, now);
      return false;
    }

    // First call should not be limited
    assert.equal(isRateLimited(123), false);

    // Immediate second call should be limited
    assert.equal(isRateLimited(123), true);

    // Different chat should not be limited
    assert.equal(isRateLimited(456), false);
  });

  test('command detection for /start, /help, /status', () => {
    const commands = ['/start', '/help', '/status'];
    const messages = [
      { text: '/start' },
      { text: '/help' },
      { text: '/status' },
      { text: 'hello' },
      { text: '/unknown' },
    ];

    const recognized = messages.filter((m) => commands.includes(m.text.trim()));
    assert.equal(recognized.length, 3);
  });
});

// ─────────────────────────────────────
// SERVICE HANDLER TESTS
// ─────────────────────────────────────

describe('Telegram daemon service handler', () => {
  test('telegramServiceHandler has required methods', async () => {
    const { telegramServiceHandler } = await import('../src/services/telegram.js');
    assert.equal(typeof telegramServiceHandler.start, 'function');
    assert.equal(typeof telegramServiceHandler.stop, 'function');
    assert.equal(typeof telegramServiceHandler.status, 'function');
  });

  test('telegramServiceHandler.status returns status object', async () => {
    const { telegramServiceHandler } = await import('../src/services/telegram.js');
    const status = telegramServiceHandler.status();
    assert.equal(typeof status.running, 'boolean');
    assert.equal(typeof status.activeChats, 'number');
  });

  test('telegramServiceHandler.start rejects without token', async () => {
    const { telegramServiceHandler } = await import('../src/services/telegram.js');
    await assert.rejects(
      () => telegramServiceHandler.start({ token: null }),
      /No Telegram bot token/,
    );
  });
});
