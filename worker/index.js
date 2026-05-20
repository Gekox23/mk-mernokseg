// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// Bindings: DB (D1)
// Vars: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI, JWT_SECRET
//       ROBLOX_CLIENT_ID, ROBLOX_CLIENT_SECRET
// =============================================

const ADMINS = ['daniell5818'];
const CORS = {
  'Access-Control-Allow-Origin': 'https://gekox23.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const ROBLOX_REDIRECT = 'https://gekox23.github.io/mk-mernokseg/callback-roblox.html';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    await initDB(env);
    const url = new URL(request.url);
    if (url.pathname === '/callback')         return handleDiscordCallback(url, request, env);
    if (url.pathname === '/callback-roblox')  return handleRobloxCallback(url, request, env);
    if (url.pathname === '/me')               return handleMe(request, env);
    if (url.pathname === '/log')              return handleLog(request, env);
    if (url.pathname === '/chat/send')        return handleChatSend(request, env);
    if (url.pathname === '/chat/messages')    return handleChatMessages(request, env);
    if (url.pathname === '/roblox-auth-url')  return handleRobloxAuthUrl(request, env);
    return new Response('MK API OK', { status: 200 });
  }
};

async function initDB(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, discord_id TEXT UNIQUE, roblox_id TEXT UNIQUE, discord_username TEXT, roblox_username TEXT, email TEXT, is_admin INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, ip TEXT, user_agent TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, avatar TEXT, message TEXT, created_at INTEGER)').run();
}

// ---- Roblox OAuth URL generator ----
async function handleRobloxAuthUrl(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const state = btoa(JSON.stringify({ token: (request.headers.get('Authorization') || '').replace('Bearer ', '') }));
  const url = `https://apis.roblox.com/oauth/v1/authorize?client_id=${env.ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(ROBLOX_REDIRECT)}&response_type=code&scope=openid+profile&state=${encodeURIComponent(state)}`;
  return jsonRes({ url });
}

// ---- Roblox OAuth callback ----
async function handleRobloxCallback(url, request, env) {
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  if (!code) return jsonRes({ error: 'Missing code' }, 400);

  // Exchange code for token
  const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.ROBLOX_CLIENT_ID,
      client_secret: env.ROBLOX_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: ROBLOX_REDIRECT,
    }),
  });
  if (!tokenRes.ok) return jsonRes({ error: 'Roblox token exchange failed' }, 401);
  const tokenData = await tokenRes.json();

  // Get Roblox user info
  const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) return jsonRes({ error: 'Failed to fetch Roblox user' }, 401);
  const rUser = await userRes.json();

  // rUser.sub = roblox user id, rUser.preferred_username = display name
  const robloxId = String(rUser.sub);
  const robloxUsername = rUser.preferred_username || rUser.name || robloxId;

  // Get Discord user from state token
  let discordUser = null;
  try {
    const state = JSON.parse(atob(decodeURIComponent(stateRaw)));
    discordUser = await verifyToken(state.token, env.JWT_SECRET);
  } catch(e) {}

  const now = Date.now();

  if (discordUser) {
    // Link roblox to existing discord account
    const existing = await env.DB.prepare('SELECT id FROM users WHERE roblox_id = ?1').bind(robloxId).first();
    if (existing && existing.id !== discordUser.id)
      return Response.redirect(`https://gekox23.github.io/mk-mernokseg/link-roblox.html?error=taken`, 302);

    await env.DB.prepare('UPDATE users SET roblox_id=?1, roblox_username=?2 WHERE discord_id=?3')
      .bind(robloxId, robloxUsername, discordUser.discord_id).run();

    const dbUser = await env.DB.prepare('SELECT * FROM users WHERE discord_id=?1').bind(discordUser.discord_id).first();
    const payload = { ...discordUser, roblox_id: robloxId, roblox_username: robloxUsername, exp: now + 86400000 };
    const token = await signToken(payload, env.JWT_SECRET);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)')
      .bind(discordUser.id, 'roblox_oauth_link', ip, request.headers.get('User-Agent') || '', now).run();

    return Response.redirect(`https://gekox23.github.io/mk-mernokseg/?token=${token}`, 302);
  } else {
    // Roblox-only login: find or create user by roblox_id
    let dbUser = await env.DB.prepare('SELECT * FROM users WHERE roblox_id=?1').bind(robloxId).first();
    if (!dbUser) {
      await env.DB.prepare('INSERT INTO users (id, roblox_id, roblox_username, is_admin, created_at) VALUES (?1,?2,?3,0,?4)')
        .bind(robloxId, robloxId, robloxUsername, now).run();
      dbUser = await env.DB.prepare('SELECT * FROM users WHERE roblox_id=?1').bind(robloxId).first();
    }
    const isAdmin = ADMINS.includes((dbUser.discord_username || '').toLowerCase());
    const payload = {
      id: dbUser.id, discord_id: dbUser.discord_id || null,
      roblox_id: robloxId, roblox_username: robloxUsername,
      username: dbUser.discord_username || robloxUsername,
      avatar: dbUser.avatar || null, email: dbUser.email || null,
      isAdmin, exp: now + 86400000,
    };
    const token = await signToken(payload, env.JWT_SECRET);
    return Response.redirect(`https://gekox23.github.io/mk-mernokseg/?token=${token}`, 302);
  }
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

  const dbUser = await env.DB.prepare('SELECT * FROM users WHERE discord_id=?1').bind(dUser.id).first();
  const payload = {
    id: dUser.id, discord_id: dUser.id, username: dUser.username,
    avatar: dUser.avatar, email: dUser.email || null,
    roblox_id: dbUser?.roblox_id || null,
    roblox_username: dbUser?.roblox_username || null,
    isAdmin, exp: now + 86400000,
  };

  const token = await signToken(payload, env.JWT_SECRET);
  const needsRoblox = !dbUser?.roblox_id;
  const redirectUrl = needsRoblox
    ? `https://gekox23.github.io/mk-mernokseg/link-roblox.html?token=${token}`
    : `https://gekox23.github.io/mk-mernokseg/?token=${token}`;
  return Response.redirect(redirectUrl, 302);
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
