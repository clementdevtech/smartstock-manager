const ACCESS_TOKEN_SKEW_MS = 60_000;

let cachedAccessToken = null;
let accessTokenExpiresAt = 0;
let accessTokenRequest = null;
let cachedAccountId = null;
let accountIdRequest = null;

function getConfig() {
  const config = {
    accountsHost: process.env.ZOHO_ACCOUNTS_HOST,
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    from: process.env.ZOHO_FROM,
    mailHost: process.env.ZOHO_MAIL_HOST,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value || !value.trim())
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Zoho email configuration is missing: ${missing.join(", ")}`);
  }

  return config;
}

function getOrigin(host) {
  const candidate = host.includes("://") ? host : `https://${host}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:") {
    throw new Error("Zoho API hosts must use HTTPS");
  }
  return parsed.origin;
}

async function readJson(response, operation) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Zoho ${operation} returned an invalid response`);
  }

  const apiCode = body?.status?.code;
  if (!response.ok || (apiCode !== undefined && Number(apiCode) !== 200)) {
    const description = body?.status?.description;
    throw new Error(
      `Zoho ${operation} failed${description ? `: ${description}` : ` (HTTP ${response.status})`}`
    );
  }

  return body;
}

async function getAccessToken(config) {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - ACCESS_TOKEN_SKEW_MS) {
    return cachedAccessToken;
  }
  if (accessTokenRequest) return accessTokenRequest;

  accessTokenRequest = (async () => {
    const params = new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    });
    const response = await fetch(`${getOrigin(config.accountsHost)}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const body = await readJson(response, "OAuth token refresh");

    if (!body.access_token) {
      throw new Error("Zoho OAuth token refresh did not return an access token");
    }

    cachedAccessToken = body.access_token;
    accessTokenExpiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
    return cachedAccessToken;
  })();

  try {
    return await accessTokenRequest;
  } finally {
    accessTokenRequest = null;
  }
}

async function zohoMailRequest(config, path, options = {}) {
  const accessToken = await getAccessToken(config);
  const response = await fetch(`${getOrigin(config.mailHost)}${path}`, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  return readJson(response, "Mail API request");
}

async function getAccountId(config) {
  if (cachedAccountId) return cachedAccountId;
  if (accountIdRequest) return accountIdRequest;

  accountIdRequest = (async () => {
    const response = await zohoMailRequest(config, "/api/accounts");
    const accountList = Array.isArray(response.data)
      ? response.data
      : response.data?.accounts || response.accounts || [];
    const from = config.from.trim().toLowerCase();
    const account = accountList.find((entry) =>
      [entry.primaryEmailAddress, entry.emailAddress, entry.email]
        .some((address) => typeof address === "string" && address.trim().toLowerCase() === from)
    );

    if (!account?.accountId) {
      throw new Error("ZOHO_FROM does not match a Zoho Mail account available to this token");
    }

    cachedAccountId = String(account.accountId);
    return cachedAccountId;
  })();

  try {
    return await accountIdRequest;
  } finally {
    accountIdRequest = null;
  }
}

async function sendEmail(to, subject, html) {
  const config = getConfig();
  const accountId = await getAccountId(config);

  return zohoMailRequest(config, `/api/accounts/${encodeURIComponent(accountId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      fromAddress: config.from.trim(),
      toAddress: to,
      subject,
      content: html,
      mailFormat: "html",
    }),
  });
}

module.exports = sendEmail;