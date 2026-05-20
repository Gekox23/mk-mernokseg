// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// Bindings: DB (D1)
// Vars: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI, JWT_SECRET
// ROBLOX OAuth2: disabled until approved
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
    await initDB(env);
    const url = new URL(request.url);
    if (url.pathname === '/callback')      return handleDiscordCallback(url, request, env);
    if (url.pathname === '/me')            return handleMe(request, env);
    if (url.pathname === '/log')           return handleLog(request, env);
    if (url.pathname === '/chat/send')     return handleChatSend(request, env);
    if (url.pathname === '/chat/messages') return handleChatMessages(request, env);
    return new Response('MK API OK', { status: 200 });
  }
};

async function initDB(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, discord_id TEXT UNIQUE, roblox_id TEXT, discord_username TEXT, roblox_username TEXT, email TEXT, is_admin INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, ip TEXT, user_agent TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, avatar TEXT, message TEXT, created_at INTEGER)').run();
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

  await env.DB.prepare('INSERT INTO users (id, discord_id, discord_username, email, is_admin, created_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, email=excluded.email, is_admin=excluded.is_admin')
    .bind(dUser.id, dUser.id, dUser.username, dUser.email || null, isAdmin ? 1 : 0, now).run();

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(dUser.id, 'discord_login', ip, request.headers.get('User-Agent') || '', now).run();

  const payload = {
    id: dUser.id, discord_id: dUser.id, username: dUser.username,
    avatar: dUser.avatar, email: dUser.email || null,
    roblox_username: null, isAdmin, exp: now + 86400000,
  };

  const token = await signToken(payload, env.JWT_SECRET);
  // Straight to main page - no Roblox linking until OAuth2 approved
  return Response.redirect(`https://gekox23.github.io/mk-mernokseg/?token=${token}`, 302);
}

// ---- /me ----
async function handleMe(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  return jsonRes(user);
}

// ---- Log ----
async function handleLog(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(user?.id || 'anonymous', body.action || 'unknown', ip, request.headers.get('User-Agent') || '', Date.now()).run();
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
  await env.DB.prepare('INSERT INTO chat (user_id, username, avatar, message, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(user.id, user.username, user.avatar || null, msg, Date.now()).run();
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(user.id, 'chat_send', request.headers.get('CF-Connecting-IP') || 'unknown', request.headers.get('User-Agent') || '', Date.now()).run();
  return jsonRes({ ok: true });
}

async function handleChatMessages(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM chat ORDER BY created_at DESC LIMIT 50').all();
  return jsonRes(rows.results.reverse());
}

// ---- Helpers ----
async function authUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
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
