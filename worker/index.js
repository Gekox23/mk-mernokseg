// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// Bindings needed: DB (D1), env vars: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI, JWT_SECRET
// =============================================

const ADMINS = ['daniell5818'];
const CORS = {
  'Access-Control-Allow-Origin': 'https://gekox23.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // Init DB tables on first run
    await initDB(env);

    const url = new URL(request.url);

    if (url.pathname === '/callback')        return handleDiscordCallback(url, request, env);
    if (url.pathname === '/roblox-link')     return handleRobloxLink(request, env);
    if (url.pathname === '/me')              return handleMe(request, env);
    if (url.pathname === '/log')             return handleLog(request, env);
    if (url.pathname === '/chat/send')       return handleChatSend(request, env);
    if (url.pathname === '/chat/messages')   return handleChatMessages(request, env);

    return new Response('MK API OK', { status: 200 });
  }
};

// ---- DB init ----
async function initDB(env) {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      discord_id TEXT UNIQUE,
      discord_username TEXT,
      roblox_username TEXT,
      email TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      username TEXT,
      avatar TEXT,
      message TEXT,
      created_at INTEGER
    );
  `);
}

// ---- Discord OAuth callback ----
async function handleDiscordCallback(url, request, env) {
  const code = url.searchParams.get('code');
  if (!code) return jsonRes({ error: 'Missing code' }, 400);

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
  if (!tokenRes.ok) return jsonRes({ error: 'Token exchange failed' }, 401);
  const tokenData = await tokenRes.json();

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) return jsonRes({ error: 'Failed to fetch user' }, 401);
  const dUser = await userRes.json();

  const isAdmin = ADMINS.includes(dUser.username.toLowerCase());
  const now = Date.now();

  // Upsert user
  await env.DB.prepare(`
    INSERT INTO users (id, discord_id, discord_username, email, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, email=excluded.email, is_admin=excluded.is_admin
  `).bind(dUser.id, dUser.id, dUser.username, dUser.email || null, isAdmin ? 1 : 0, now).run();

  // Log login
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  await env.DB.prepare(`INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?, 'discord_login', ?, ?, ?)`)
    .bind(dUser.id, ip, ua, now).run();

  // Fetch full user (with roblox)
  const dbUser = await env.DB.prepare('SELECT * FROM users WHERE discord_id = ?').bind(dUser.id).first();

  const payload = {
    id: dUser.id,
    discord_id: dUser.id,
    username: dUser.username,
    avatar: dUser.avatar,
    email: dUser.email || null,
    roblox_username: dbUser?.roblox_username || null,
    isAdmin,
    exp: now + 86400000,
  };

  const token = await signToken(payload, env.JWT_SECRET);
  // If no roblox linked yet, redirect to roblox linking page
  const needsRoblox = !dbUser?.roblox_username;
  const redirectUrl = needsRoblox
    ? `https://gekox23.github.io/mk-mernokseg/link-roblox.html?token=${token}`
    : `https://gekox23.github.io/mk-mernokseg/?token=${token}`;
  return Response.redirect(redirectUrl, 302);
}

// ---- Roblox link ----
async function handleRobloxLink(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);

  const body = await request.json();
  const roblox = (body.roblox_username || '').trim();
  if (!roblox) return jsonRes({ error: 'Missing roblox_username' }, 400);

  // Check if roblox username already linked to another account
  const existing = await env.DB.prepare('SELECT discord_id FROM users WHERE roblox_username = ?').bind(roblox).first();
  if (existing && existing.discord_id !== user.discord_id) {
    return jsonRes({ error: 'Ez a Roblox felhasználónév már más fiókhoz van kötve!' }, 409);
  }

  await env.DB.prepare('UPDATE users SET roblox_username = ? WHERE discord_id = ?')
    .bind(roblox, user.discord_id).run();

  // Log
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare(`INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?, 'roblox_link', ?, ?, ?)`)
    .bind(user.id, ip, request.headers.get('User-Agent') || '', Date.now()).run();

  // Return updated token
  const newPayload = { ...user, roblox_username: roblox, exp: Date.now() + 86400000 };
  const token = await signToken(newPayload, env.JWT_SECRET);
  return jsonRes({ success: true, token });
}

// ---- /me ----
async function handleMe(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  return jsonRes(user);
}

// ---- Log action ----
async function handleLog(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  const body = await request.json();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  await env.DB.prepare(`INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(user?.id || 'anonymous', body.action || 'unknown', ip, ua, Date.now()).run();
  return jsonRes({ ok: true });
}

// ---- Chat ----
async function handleChatSend(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges a chathez!' }, 401);
  const body = await request.json();
  const msg = (body.message || '').trim().slice(0, 500);
  if (!msg) return jsonRes({ error: 'Üres üzenet' }, 400);
  await env.DB.prepare(`INSERT INTO chat (user_id, username, avatar, message, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(user.id, user.username, user.avatar || null, msg, Date.now()).run();
  // Log
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare(`INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?, 'chat_send', ?, ?, ?)`)
    .bind(user.id, ip, request.headers.get('User-Agent') || '', Date.now()).run();
  return jsonRes({ ok: true });
}

async function handleChatMessages(request, env) {
  const rows = await env.DB.prepare(`SELECT * FROM chat ORDER BY created_at DESC LIMIT 50`).all();
  return jsonRes(rows.results.reverse());
}

// ---- Helpers ----
async function authUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || Date.now() > payload.exp) return null;
  return payload;
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function signToken(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = btoa(JSON.stringify(payload));
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))));
  return `${data}.${sig}`;
}

async function verifyToken(token, secret) {
  try {
    const [data, sig] = token.split('.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(sig), c => c.charCodeAt(0)), enc.encode(data));
    return valid ? JSON.parse(atob(data)) : null;
  } catch { return null; }
}
