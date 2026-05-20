// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// =============================================

const ADMINS = ['daniell5818'];

const WEBHOOK_EVENTS  = 'https://discord.com/api/webhooks/1506767270062457023/Pf-ZYkhTAj1R_QKm4YDB7CfSXLiUXjf1oMNVGxE-i8QVRIWS316fjK4-qgHxk7Pl4tVk';
const WEBHOOK_OKTATAS = 'https://discord.com/api/webhooks/1506772218556711064/I7nV6_NFGWp0H5mEfq_UHx7ZSTzdopyN_e4re8e-7Ioi6UqXwT4DiwAEkIZCeEmLgcxj';
const WEBHOOK_LOG     = 'https://discord.com/api/webhooks/1506768409038426144/55NhExpjToN7nj5ScGAsRT6mp-2b41c2OMQYhpGmpM01QuXgU8789xtXQwHbHoIW8k9j';

const WEBHOOK_EVENTS_ID  = '1506767270062457023';
const WEBHOOK_OKTATAS_ID = '1506772218556711064';
const WEBHOOK_EVENTS_TOKEN  = 'Pf-ZYkhTAj1R_QKm4YDB7CfSXLiUXjf1oMNVGxE-i8QVRIWS316fjK4-qgHxk7Pl4tVk';
const WEBHOOK_OKTATAS_TOKEN = 'I7nV6_NFGWp0H5mEfq_UHx7ZSTzdopyN_e4re8e-7Ioi6UqXwT4DiwAEkIZCeEmLgcxj';

const IMG_TOBORZAS = 'https://raw.githubusercontent.com/Gekox23/mk-mernokseg/main/assets/toborzas.png';
const IMG_OKTATAS  = 'https://raw.githubusercontent.com/Gekox23/mk-mernokseg/main/assets/OKTATS.png';
const IMG_UTINFO   = 'https://raw.githubusercontent.com/Gekox23/mk-mernokseg/main/assets/Utinfo.png';

const CORS = {
  'Access-Control-Allow-Origin': 'https://gekox23.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function sendEmbed(webhookUrl, embed) {
  try {
    const r = await fetch(webhookUrl + '?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (r.ok) { const d = await r.json(); return d.id || null; }
  } catch (_) {}
  return null;
}

async function editEmbed(webhookId, webhookToken, messageId, embed) {
  try {
    await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (_) {}
}

async function deleteMessage(webhookId, webhookToken, messageId) {
  try {
    await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${messageId}`, {
      method: 'DELETE',
    });
  } catch (_) {}
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      await initDB(env);
      const url = new URL(request.url);
      if (url.pathname === '/callback')            return handleDiscordCallback(url, request, env);
      if (url.pathname === '/me')                  return handleMe(request, env);
      if (url.pathname === '/log')                 return handleLog(request, env);
      if (url.pathname === '/chat/send')           return handleChatSend(request, env);
      if (url.pathname === '/chat/messages')       return handleChatMessages(request, env);
      if (url.pathname === '/events')              return handleGetEvents(request, env);
      if (url.pathname === '/event/create')        return handleCreateEvent(request, env);
      if (url.pathname === '/event/update')        return handleUpdateEvent(request, env);
      if (url.pathname === '/event/book')          return handleBookSlot(request, env);
      if (url.pathname === '/event/delete')        return handleDeleteEvent(request, env);
      if (url.pathname === '/event/unsubscribe')   return handleUnsubscribe(request, env);
      if (url.pathname === '/admin/users')         return handleAdminUsers(request, env);
      if (url.pathname === '/admin/set-supervisor') return handleSetSupervisor(request, env);
      return new Response('MK API OK', { status: 200, headers: CORS });
    } catch (err) {
      return jsonRes({ error: 'Internal error', detail: String(err) }, 500);
    }
  }
};

async function initDB(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, discord_id TEXT UNIQUE, roblox_id TEXT, discord_username TEXT, roblox_username TEXT, email TEXT, is_admin INTEGER DEFAULT 0, is_supervisor INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, ip TEXT, user_agent TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, avatar TEXT, message TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, type TEXT, start_time INTEGER, end_time INTEGER, max_slots INTEGER DEFAULT 0, created_by TEXT, creator_name TEXT, discord_message_id TEXT, discord_webhook_type TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, user_id TEXT, email TEXT, username TEXT, created_at INTEGER)').run();
  // migrate: add missing columns silently
  for (const col of [
    "ALTER TABLE users ADD COLUMN is_supervisor INTEGER DEFAULT 0",
    "ALTER TABLE events ADD COLUMN creator_name TEXT",
    "ALTER TABLE events ADD COLUMN discord_message_id TEXT",
    "ALTER TABLE events ADD COLUMN discord_webhook_type TEXT",
  ]) { try { await env.DB.prepare(col).run(); } catch(_) {} }
}

// ---- helpers ----
function buildEmbed(ev, bookedCount) {
  const startStr = new Date(ev.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const endStr   = new Date(ev.end_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const bookUrl  = `https://gekox23.github.io/mk-mernokseg/foglalas.html?event=${ev.id}`;
  const siteUrl  = 'https://gekox23.github.io/mk-mernokseg/';
  const descBlock = ev.description ? `# ${ev.title}\n${ev.description}` : `# ${ev.title}`;
  const slots = ev.max_slots > 0
    ? `${bookedCount}/${ev.max_slots} fő`
    : 'Korlátlan';

  if (ev.type === 'toborzas') return {
    title: '🎮 Magyar Közút toborzást hirdetett!',
    description: descBlock,
    color: 0xef7a14,
    image: { url: IMG_TOBORZAS },
    fields: [
      { name: '⏰ Kezdés', value: startStr, inline: true },
      { name: '⏳ Vége', value: endStr, inline: true },
      { name: '👥 Férőhelyek', value: slots, inline: true },
      { name: '🔗 Jelentkezés', value: `[✅ Jelentkezem a toborzásra!](${bookUrl})`, inline: false },
    ],
    footer: { text: 'Mezőkovácsházi Mérnökség' },
    timestamp: new Date().toISOString(),
  };

  if (ev.type === 'foglalas') return {
    title: '📚 Új oktatás került meghirdetésre!',
    description: descBlock,
    color: 0x22c55e,
    image: { url: IMG_OKTATAS },
    fields: [
      { name: '👤 Oktató', value: ev.creator_name || ev.title, inline: false },
      { name: '⏰ Kezdés', value: startStr, inline: true },
      { name: '⏳ Vége', value: endStr, inline: true },
      { name: '👥 Férőhelyek', value: slots, inline: true },
      { name: '🔗 Jelentkezés', value: `[✅ Jelentkezem az oktatásra!](${bookUrl})`, inline: false },
    ],
    footer: { text: 'Mezőkovácsházi Mérnökség' },
    timestamp: new Date().toISOString(),
  };

  return {
    title: '🚧 Útinfo',
    description: descBlock,
    color: 0x3b82f6,
    image: { url: IMG_UTINFO },
    fields: [
      { name: '⏰ Érvényes ettől', value: startStr, inline: true },
      { name: '⏳ Érvényes eddig', value: endStr, inline: true },
      { name: '🌐 További infó', value: `[Weboldal megnyitása](${siteUrl})`, inline: false },
    ],
    footer: { text: 'Mezőkovácsházi Mérnökség' },
    timestamp: new Date().toISOString(),
  };
}

function webhookForType(type) {
  return type === 'foglalas'
    ? { url: WEBHOOK_OKTATAS, id: WEBHOOK_OKTATAS_ID, token: WEBHOOK_OKTATAS_TOKEN, key: 'foglalas' }
    : { url: WEBHOOK_EVENTS,  id: WEBHOOK_EVENTS_ID,  token: WEBHOOK_EVENTS_TOKEN,  key: 'events' };
}

// ---- handlers ----
async function handleAdminUsers(request, env) {
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Forbidden' }, 403);
  const rows = await env.DB.prepare('SELECT id, discord_username, email, is_admin, is_supervisor, created_at FROM users ORDER BY created_at DESC').all();
  return jsonRes(rows.results);
}

async function handleSetSupervisor(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Forbidden' }, 403);
  const { user_id, value } = await request.json();
  await env.DB.prepare('UPDATE users SET is_supervisor=?1 WHERE id=?2').bind(value ? 1 : 0, user_id).run();
  return jsonRes({ ok: true });
}

async function handleDeleteEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { event_id } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!ev) return jsonRes({ error: 'Nem található' }, 404);
  if (!user.isAdmin && ev.created_by !== user.id) return jsonRes({ error: 'Csak a saját eseményedet törölheted!' }, 403);
  // delete discord message
  if (ev.discord_message_id) {
    const wh = webhookForType(ev.type);
    await deleteMessage(wh.id, wh.token, ev.discord_message_id);
  }
  await env.DB.prepare('DELETE FROM bookings WHERE event_id=?1').bind(event_id).run();
  await env.DB.prepare('DELETE FROM events WHERE id=?1').bind(event_id).run();
  await sendEmbed(WEBHOOK_LOG, { title: '🗑️ Log: esemény törölve', description: `**${user.username}** törölte: **${ev.title}**`, color: 0xe74c3c, timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}

async function handleGetEvents(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  return jsonRes(rows.results);
}

async function handleCreateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { title, description, type, start_time, end_time, max_slots } = await request.json();
  if (!title || !start_time || !end_time || !type) return jsonRes({ error: 'Hiányzó mezők' }, 400);
  // supervisor csak foglalas-t posztolhat
  if (user.isSupervisor && !user.isAdmin && type !== 'foglalas') return jsonRes({ error: 'Supervisor csak oktatást hozhat létre!' }, 403);
  const id = crypto.randomUUID();
  const ev = { id, title, description: description || '', type, start_time, end_time, max_slots: max_slots || 0, created_by: user.id, creator_name: user.username };
  await env.DB.prepare('INSERT INTO events (id, title, description, type, start_time, end_time, max_slots, created_by, creator_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
    .bind(id, title, ev.description, type, start_time, end_time, ev.max_slots, user.id, user.username, Date.now()).run();
  const wh = webhookForType(type);
  const msgId = await sendEmbed(wh.url, buildEmbed(ev, 0));
  if (msgId) await env.DB.prepare('UPDATE events SET discord_message_id=?1, discord_webhook_type=?2 WHERE id=?3').bind(msgId, wh.key, id).run();
  await sendEmbed(WEBHOOK_LOG, { title: '📝 Log: új esemény', description: `**${user.username}** létrehozta: **${title}** (${type})`, color: 0x8fa4bc, timestamp: new Date().toISOString() });
  return jsonRes({ ok: true, id });
}

async function handleUpdateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { event_id, title, description, start_time, end_time, max_slots } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!ev) return jsonRes({ error: 'Nem található' }, 404);
  if (!user.isAdmin && ev.created_by !== user.id) return jsonRes({ error: 'Csak a saját eseményedet szerkesztheted!' }, 403);
  const newTitle = title ?? ev.title;
  const newDesc  = description ?? ev.description;
  const newStart = start_time ?? ev.start_time;
  const newEnd   = end_time ?? ev.end_time;
  const newSlots = max_slots ?? ev.max_slots;
  await env.DB.prepare('UPDATE events SET title=?1, description=?2, start_time=?3, end_time=?4, max_slots=?5 WHERE id=?6')
    .bind(newTitle, newDesc, newStart, newEnd, newSlots, event_id).run();
  // update discord message
  const updEv = { ...ev, title: newTitle, description: newDesc, start_time: newStart, end_time: newEnd, max_slots: newSlots };
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
  const bookedCount = countRow?.c || 0;
  if (ev.discord_message_id) {
    const wh = webhookForType(ev.type);
    await editEmbed(wh.id, wh.token, ev.discord_message_id, buildEmbed(updEv, bookedCount));
  }
  await sendEmbed(WEBHOOK_LOG, { title: '✏️ Log: esemény szerkesztve', description: `**${user.username}** szerkesztette: **${newTitle}**`, color: 0x8fa4bc, timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}

async function handleBookSlot(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges a jelentkezéshez!' }, 401);
  const { event_id } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const event = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!event) return jsonRes({ error: 'Esemény nem található' }, 404);
  const existing = await env.DB.prepare('SELECT id FROM bookings WHERE event_id=?1 AND user_id=?2').bind(event_id, user.id).first();
  if (existing) return jsonRes({ error: 'Már jelentkeztél erre az eseményre!' }, 409);
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
  const bookedCount = countRow?.c || 0;
  if (event.max_slots > 0 && bookedCount >= event.max_slots) return jsonRes({ error: 'Nincs több szabad hely!' }, 400);
  await env.DB.prepare('INSERT INTO bookings (event_id, user_id, email, username, created_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(event_id, user.id, user.email || '', user.username, Date.now()).run();
  const newCount = bookedCount + 1;
  // update discord embed
  if (event.discord_message_id) {
    const wh = webhookForType(event.type);
    await editEmbed(wh.id, wh.token, event.discord_message_id, buildEmbed(event, newCount));
  }
  const startStr = new Date(event.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  await sendEmbed(WEBHOOK_LOG, { title: '✅ Log: új jelentkezés', description: `**${user.username}** jelentkezett: **${event.title}**`, color: 0x22c55e, fields: [{ name: '⏰ Időpont', value: startStr, inline: true }, { name: '📧 Email', value: user.email || 'nincs', inline: true }], timestamp: new Date().toISOString() });
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
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: env.REDIRECT_URI }) });
  if (!tokenRes.ok) return jsonRes({ error: 'Token exchange failed' }, 401);
  const tokenData = await tokenRes.json();
  const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
  if (!userRes.ok) return jsonRes({ error: 'Failed to fetch user' }, 401);
  const dUser = await userRes.json();
  const isAdmin = ADMINS.includes(dUser.username.toLowerCase());
  const now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, discord_id, discord_username, email, is_admin, created_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, email=excluded.email, is_admin=excluded.is_admin')
    .bind(dUser.id, dUser.id, dUser.username, dUser.email || null, isAdmin ? 1 : 0, now).run();
  const dbUser = await env.DB.prepare('SELECT is_supervisor FROM users WHERE discord_id=?1').bind(dUser.id).first();
  const isSupervisor = dbUser?.is_supervisor === 1;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)').bind(dUser.id, 'discord_login', ip, request.headers.get('User-Agent') || '', now).run();
  await sendEmbed(WEBHOOK_LOG, { title: '🔑 Log: belépés', description: `**${dUser.username}** bejelentkezett Discord-dal`, color: 0x5865f2, fields: [{ name: '📍 IP', value: ip, inline: true }], timestamp: new Date().toISOString() });
  const payload = { id: dUser.id, discord_id: dUser.id, username: dUser.username, avatar: dUser.avatar, email: dUser.email || null, roblox_username: null, isAdmin, isSupervisor, exp: now + 86400000 };
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
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)').bind(user?.id || 'anonymous', body.action || 'unknown', ip, request.headers.get('User-Agent') || '', Date.now()).run();
  await sendEmbed(WEBHOOK_LOG, { title: '📝 Log: aktivitás', description: `**${user?.username || 'ismeretlen'}** → ${body.action || 'unknown'}`, color: 0x8fa4bc, fields: [{ name: 'IP', value: ip, inline: true }], timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}
async function handleChatSend(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges a chathez!' }, 401);
  const body = await request.json();
  const msg = (body.message || '').trim().slice(0, 500);
  if (!msg) return jsonRes({ error: 'Üres üzenet' }, 400);
  await env.DB.prepare('INSERT INTO chat (user_id, username, avatar, message, created_at) VALUES (?1,?2,?3,?4,?5)').bind(user.id, user.username, user.avatar || null, msg, Date.now()).run();
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)').bind(user.id, 'chat_send', request.headers.get('CF-Connecting-IP') || 'unknown', request.headers.get('User-Agent') || '', Date.now()).run();
  await sendEmbed(WEBHOOK_LOG, { title: '💬 Log: chat üzenet', description: `**${user.username}**: ${msg.slice(0, 200)}`, color: 0x8fa4bc, timestamp: new Date().toISOString() });
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
