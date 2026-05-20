// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// Bindings: DB (D1)
// Vars: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI, JWT_SECRET
// =============================================

const ADMINS = ['daniell5818'];

// Webhook 1: Események kihirdetése (létrehozás, törlés)
const WEBHOOK_EVENTS = 'https://discord.com/api/webhooks/1506767270062457023/Pf-ZYkhTAj1R_QKm4YDB7CfSXLiUXjf1oMNVGxE-i8QVRIWS316fjK4-qgHxk7Pl4tVk';
// Webhook 2: Log / aktivitás (belépés, jelentkezés, chat)
const WEBHOOK_LOG = 'https://discord.com/api/webhooks/1506768409038426144/55NhExpjToN7nj5ScGAsRT6mp-2b41c2OMQYhpGmpM01QuXgU8789xtXQwHbHoIW8k9j';

const CORS = {
  'Access-Control-Allow-Origin': 'https://gekox23.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function sendEmbed(webhookUrl, embed) {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (_) {}
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      await initDB(env);
      const url = new URL(request.url);
      if (url.pathname === '/callback')          return handleDiscordCallback(url, request, env);
      if (url.pathname === '/me')                return handleMe(request, env);
      if (url.pathname === '/log')               return handleLog(request, env);
      if (url.pathname === '/chat/send')         return handleChatSend(request, env);
      if (url.pathname === '/chat/messages')     return handleChatMessages(request, env);
      if (url.pathname === '/events')            return handleGetEvents(request, env);
      if (url.pathname === '/event/create')      return handleCreateEvent(request, env);
      if (url.pathname === '/event/book')        return handleBookSlot(request, env);
      if (url.pathname === '/event/delete')      return handleDeleteEvent(request, env);
      if (url.pathname === '/event/unsubscribe') return handleUnsubscribe(request, env);
      if (url.pathname === '/admin/users')       return handleAdminUsers(request, env);
      return new Response('MK API OK', { status: 200, headers: CORS });
    } catch (err) {
      return jsonRes({ error: 'Internal error', detail: String(err) }, 500);
    }
  }
};

async function initDB(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, discord_id TEXT UNIQUE, roblox_id TEXT, discord_username TEXT, roblox_username TEXT, email TEXT, is_admin INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, ip TEXT, user_agent TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, avatar TEXT, message TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, type TEXT, start_time INTEGER, end_time INTEGER, max_slots INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, user_id TEXT, email TEXT, username TEXT, created_at INTEGER)').run();
}

async function handleAdminUsers(request, env) {
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Forbidden' }, 403);
  const rows = await env.DB.prepare('SELECT id, discord_username, email, is_admin, created_at FROM users ORDER BY created_at DESC').all();
  return jsonRes(rows.results);
}

async function handleDeleteEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Csak admin törölhet eseményt!' }, 403);
  const body = await request.json();
  const { event_id } = body;
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const ev = await env.DB.prepare('SELECT title FROM events WHERE id=?1').bind(event_id).first();
  await env.DB.prepare('DELETE FROM bookings WHERE event_id=?1').bind(event_id).run();
  await env.DB.prepare('DELETE FROM events WHERE id=?1').bind(event_id).run();
  if (ev) {
    // Esemény törlése → WEBHOOK_EVENTS
    await sendEmbed(WEBHOOK_EVENTS, {
      title: '🗑️ Esemény törölve',
      description: `**${ev.title}** eseményt törölte: **${user.username}**`,
      color: 0xe74c3c,
      timestamp: new Date().toISOString(),
    });
    // Log → WEBHOOK_LOG
    await sendEmbed(WEBHOOK_LOG, {
      title: '🗑️ Log: esemény törölve',
      description: `**${user.username}** törölte: **${ev.title}**`,
      color: 0xe74c3c,
      timestamp: new Date().toISOString(),
    });
  }
  return jsonRes({ ok: true });
}

async function handleGetEvents(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  return jsonRes(rows.results);
}

async function handleCreateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Csak admin hozhat létre eseményt!' }, 403);
  const body = await request.json();
  const { title, description, type, start_time, end_time, max_slots } = body;
  if (!title || !start_time || !end_time || !type) return jsonRes({ error: 'Hiányzó mezők' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO events (id, title, description, type, start_time, end_time, max_slots, created_by, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
    .bind(id, title, description || '', type, start_time, end_time, max_slots || 0, user.id, Date.now()).run();

  const startStr = new Date(start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const endStr   = new Date(end_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const typeLabel = type === 'toborzas' ? '🎮 Tobورzás' : type === 'foglalas' ? '📅 Időpontfoglalás' : '🚧 Napi infó';
  const color = type === 'toborzas' ? 0xef7a14 : type === 'foglalas' ? 0x22c55e : 0x3b82f6;
  const linkUrl = type === 'lezaras'
    ? 'https://gekox23.github.io/mk-mernokseg/'
    : `https://gekox23.github.io/mk-mernokseg/foglalas.html?event=${id}`;
  const linkLabel = type === 'lezaras' ? '🌐 Weboldal megnyitása' : '✅ Jelentkezem';

  // Esemény kihirdetése → WEBHOOK_EVENTS
  await sendEmbed(WEBHOOK_EVENTS, {
    title: `${typeLabel}: ${title}`,
    description: description || '',
    color,
    fields: [
      { name: '⏰ Kezdés', value: startStr, inline: true },
      { name: '⏳ Vége', value: endStr, inline: true },
      { name: '👥 Max. fő', value: max_slots > 0 ? String(max_slots) : 'Korlátlan', inline: true },
      { name: '🔗 Link', value: `[${linkLabel}](${linkUrl})` },
    ],
    footer: { text: `Létrehozta: ${user.username}` },
    timestamp: new Date().toISOString(),
  });

  // Log → WEBHOOK_LOG
  await sendEmbed(WEBHOOK_LOG, {
    title: '📝 Log: új esemény létrehozva',
    description: `**${user.username}** létrehozta: **${title}** (${typeLabel})`,
    color: 0x8fa4bc,
    timestamp: new Date().toISOString(),
  });

  return jsonRes({ ok: true, id });
}

async function handleBookSlot(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges!' }, 401);
  const body = await request.json();
  const { event_id } = body;
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const event = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!event) return jsonRes({ error: 'Esemény nem található' }, 404);
  const existing = await env.DB.prepare('SELECT id FROM bookings WHERE event_id=?1 AND user_id=?2').bind(event_id, user.id).first();
  if (existing) return jsonRes({ error: 'Már jelentkeztél erre az eseményre!' }, 409);
  if (event.max_slots > 0) {
    const count = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
    if (count.c >= event.max_slots) return jsonRes({ error: 'Nincs több szabad hely!' }, 400);
  }
  await env.DB.prepare('INSERT INTO bookings (event_id, user_id, email, username, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(event_id, user.id, user.email || '', user.username, Date.now()).run();

  const startStr = new Date(event.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  // Jelentkezés log → WEBHOOK_LOG
  await sendEmbed(WEBHOOK_LOG, {
    title: '✅ Log: új jelentkezés',
    description: `**${user.username}** jelentkezett: **${event.title}**`,
    color: 0x22c55e,
    fields: [
      { name: '⏰ Időpont', value: startStr, inline: true },
      { name: '📧 Email', value: user.email || 'nincs', inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonRes({ ok: true });
}

async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response('Hiányzó email', { status: 400, headers: CORS });
  await env.DB.prepare('UPDATE users SET email=NULL WHERE email=?1').bind(email).run();
  return new Response('<html><body style="font-family:Arial;background:#0f1826;color:#dce8f5;display:flex;align-items:center;justify-content:center;height:100vh"><h2>✅ Sikeresen leiratkoztál az értesítőkről.</h2></body></html>', { headers: { 'Content-Type': 'text/html', ...CORS } });
}

async function handleDiscordCallback(url, request, env) {
  const code = url.searchParams.get('code');
  if (!code) return jsonRes({ error: 'Missing code' }, 400);
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: env.REDIRECT_URI }),
  });
  if (!tokenRes.ok) return jsonRes({ error: 'Token exchange failed' }, 401);
  const tokenData = await tokenRes.json();
  const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
  if (!userRes.ok) return jsonRes({ error: 'Failed to fetch user' }, 401);
  const dUser = await userRes.json();
  const isAdmin = ADMINS.includes(dUser.username.toLowerCase());
  const now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, discord_id, discord_username, email, is_admin, created_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, email=excluded.email, is_admin=excluded.is_admin')
    .bind(dUser.id, dUser.id, dUser.username, dUser.email || null, isAdmin ? 1 : 0, now).run();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(dUser.id, 'discord_login', ip, request.headers.get('User-Agent') || '', now).run();
  // Belépés log → WEBHOOK_LOG
  await sendEmbed(WEBHOOK_LOG, {
    title: '🔑 Log: belépés',
    description: `**${dUser.username}** bejelentkezett Discord-dal`,
    color: 0x5865f2,
    fields: [{ name: '📍 IP', value: ip, inline: true }],
    timestamp: new Date().toISOString(),
  });
  const payload = { id: dUser.id, discord_id: dUser.id, username: dUser.username, avatar: dUser.avatar, email: dUser.email || null, roblox_username: null, isAdmin, exp: now + 86400000 };
  const token = await signToken(payload, env.JWT_SECRET);
  return Response.redirect(`https://gekox23.github.io/mk-mernokseg/?token=${token}`, 302);
}

async function handleMe(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  return jsonRes(user);
}
async function handleLog(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(user?.id || 'anonymous', body.action || 'unknown', ip, request.headers.get('User-Agent') || '', Date.now()).run();
  // Általános log → WEBHOOK_LOG
  await sendEmbed(WEBHOOK_LOG, {
    title: '📝 Log: aktivitás',
    description: `**${user?.username || 'ismeretlen'}** → ${body.action || 'unknown'}`,
    color: 0x8fa4bc,
    fields: [{ name: 'IP', value: ip, inline: true }],
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}
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
  // Chat log → WEBHOOK_LOG
  await sendEmbed(WEBHOOK_LOG, {
    title: '💬 Log: chat üzenet',
    description: `**${user.username}**: ${msg.slice(0, 200)}`,
    color: 0x8fa4bc,
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}
async function handleChatMessages(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM chat ORDER BY created_at DESC LIMIT 50').all();
  return jsonRes(rows.results.reverse());
}
async function authUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || Date.now() > payload.exp) return null;
  return payload;
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
