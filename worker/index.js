// =============================================
// Mezőkovácsházi Mérnökség - Discord OAuth Worker
// Deploy this on Cloudflare Workers
// =============================================

// Admin Discord usernames (lowercase)
const ADMINS = ['daniell5818'];

// Set these as Cloudflare Worker Environment Variables:
// DISCORD_CLIENT_ID
// DISCORD_CLIENT_SECRET
// REDIRECT_URI  -> https://gekox23.github.io/mk-mernokseg/callback.html
// JWT_SECRET    -> any random long string

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://gekox23.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Route: /callback?code=...
    if (url.pathname === '/callback') {
      return handleCallback(url, env);
    }

    // Route: /me  (verify token, return user info)
    if (url.pathname === '/me') {
      return handleMe(request, env);
    }

    return new Response('Mezőkovácsházi Mérnökség API', { status: 200 });
  }
};

// Step 1: Exchange code for Discord token, get user info
async function handleCallback(url, env) {
  const code = url.searchParams.get('code');
  if (!code) {
    return jsonResponse({ error: 'Missing code' }, 400);
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    return jsonResponse({ error: 'Token exchange failed' }, 401);
  }

  const tokenData = await tokenRes.json();

  // Get Discord user info
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return jsonResponse({ error: 'Failed to fetch user' }, 401);
  }

  const user = await userRes.json();
  const isAdmin = ADMINS.includes(user.username.toLowerCase());

  // Create a simple signed JWT-like token
  const payload = {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    email: user.email || null,
    isAdmin,
    exp: Date.now() + 1000 * 60 * 60 * 24, // 24h expiry
  };

  const token = await signToken(payload, env.JWT_SECRET);

  // Redirect back to the site with token
  const redirectUrl = `https://gekox23.github.io/mk-mernokseg/?token=${token}`;
  return Response.redirect(redirectUrl, 302);
}

// Step 2: Verify token and return user info
async function handleMe(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();

  if (!token) {
    return jsonResponse({ error: 'No token' }, 401);
  }

  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }
  if (Date.now() > payload.exp) {
    return jsonResponse({ error: 'Token expired' }, 401);
  }

  return jsonResponse(payload, 200);
}

// ---- Helpers ----
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function signToken(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const data = btoa(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

async function verifyToken(token, secret) {
  try {
    const [data, sig] = token.split('.');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    if (!valid) return null;
    return JSON.parse(atob(data));
  } catch {
    return null;
  }
}
