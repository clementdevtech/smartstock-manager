const test = require("node:test");
const assert = require("node:assert/strict");

test("Zoho sender refreshes a token, finds the configured account, and sends HTML", async () => {
  const savedEnv = { ...process.env };
  const originalFetch = global.fetch;
  const calls = [];

  Object.assign(process.env, {
    ZOHO_ACCOUNTS_HOST: "accounts.zoho.com",
    ZOHO_CLIENT_ID: "client-id",
    ZOHO_CLIENT_SECRET: "client-secret",
    ZOHO_FROM: "noreply@example.com",
    ZOHO_MAIL_HOST: "mail.zoho.com",
    ZOHO_REFRESH_TOKEN: "refresh-token",
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/oauth/v2/token")) {
      return Response.json({ access_token: "access-token", expires_in: 3600 });
    }
    if (String(url).endsWith("/api/accounts")) {
      return Response.json({
        data: [{ accountId: "account-42", primaryEmailAddress: "noreply@example.com" }],
      });
    }
    return Response.json({ status: { code: 200, description: "success" } });
  };

  try {
    const emailModulePath = require.resolve("../utils/email");
    delete require.cache[emailModulePath];
    const sendEmail = require(emailModulePath);
    await sendEmail("owner@example.com", "Verify account", "<p>123456</p>");

    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, "https://accounts.zoho.com/oauth/v2/token");
    assert.equal(calls[1].url, "https://mail.zoho.com/api/accounts");
    assert.equal(calls[1].options.headers.Authorization, "Zoho-oauthtoken access-token");
    assert.equal(
      calls[2].url,
      "https://mail.zoho.com/api/accounts/account-42/messages"
    );
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      fromAddress: "noreply@example.com",
      toAddress: "owner@example.com",
      subject: "Verify account",
      content: "<p>123456</p>",
      mailFormat: "html",
    });
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  }
});