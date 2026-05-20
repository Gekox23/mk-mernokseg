// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// Bindings: DB (D1)
// Vars: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI, JWT_SECRET
//       GOOGLE_SERVICE_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CALENDAR_ID
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
    if (url.pathname === '/callback')            return handleDiscordCallback(url, request, env);
    if (url.pathname === '/me')                  return handleMe(request, env);
    if (url.pathname === '/log')                 return handleLog(request, env);
    if (url.pathname === '/chat/send')           return handleChatSend(request, env);
    if (url.pathname === '/chat/messages')       return handleChatMessages(request, env);
    // Calendar & email endpoints
    if (url.pathname === '/events')              return handleGetEvents(request, env);
    if (url.pathname === '/event/create')        return handleCreateEvent(request, env);
    if (url.pathname === '/event/book')          return handleBookSlot(request, env);
    if (url.pathname === '/event/unsubscribe')   return handleUnsubscribe(request, env);
    return new Response('MK API OK', { status: 200 });
  }
};

async function initDB(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, discord_id TEXT UNIQUE, roblox_id TEXT, discord_username TEXT, roblox_username TEXT, email TEXT, is_admin INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, ip TEXT, user_agent TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, avatar TEXT, message TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, type TEXT, start_time INTEGER, end_time INTEGER, max_slots INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, user_id TEXT, email TEXT, username TEXT, calendar_event_id TEXT, created_at INTEGER)').run();
}

// ---- Google Auth ----
async function getGoogleToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const claim = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const unsigned = `${header}.${claim}`;
  const pemKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const pemBody = pemKey.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${unsigned}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const data = await res.json();
  return data.access_token;
}

// ---- Calendar helpers ----
async function createCalendarEvent(env, token, title, description, startTime, endTime, attendeeEmail) {
  const event = {
    summary: title,
    description,
    start: { dateTime: new Date(startTime).toISOString(), timeZone: 'Europe/Budapest' },
    end: { dateTime: new Date(endTime).toISOString(), timeZone: 'Europe/Budapest' },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
    reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 30 }] }
  };
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?sendUpdates=all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  return await res.json();
}

// ---- Email helper (Gmail API) ----
async function sendEmail(env, token, to, subject, htmlBody) {
  const msg = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ].join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/${env.GOOGLE_SERVICE_EMAIL}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded })
  });
}

// ---- GET /events ----
async function handleGetEvents(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  return jsonRes(rows.results);
}

// ---- POST /event/create (admin only) ----
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

  // If toborzas: send email to all users with email
  if (type === 'toborzas') {
    const users = await env.DB.prepare('SELECT email, discord_username FROM users WHERE email IS NOT NULL').all();
    const token = await getGoogleToken(env);
    const startStr = new Date(start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
    for (const u of users.results) {
      if (!u.email) continue;
      const unsubUrl = `https://mk.gekox1111.workers.dev/event/unsubscribe?email=${encodeURIComponent(u.email)}`;
      await sendEmail(env, token, u.email,
        `🎮 Tobörzés – ${title}`,
        `<div style="font-family:Arial,sans-serif;background:#0f1826;color:#dce8f5;padding:32px;border-radius:16px;max-width:520px">
          <h2 style="color:#ef7a14">🎮 Új Tobörzés!</h2>
          <h3 style="margin:8px 0">${title}</h3>
          <p style="color:#8fa4bc">${description || ''}</p>
          <p style="margin-top:16px"><b>⏰ Időpont:</b> ${startStr}</p>
          <a href="https://gekox23.github.io/mk-mernokseg/foglalas.html?event=${id}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#ef7a14;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">✅ Jelentkezem</a>
          <p style="margin-top:24px;font-size:12px;color:#4a6580"><a href="${unsubUrl}" style="color:#4a6580">Leiratkozás az ertesitőkről</a></p>
        </div>`
      );
    }
  }

  return jsonRes({ ok: true, id });
}

// ---- POST /event/book ----
async function handleBookSlot(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges!' }, 401);
  if (!user.email) return jsonRes({ error: 'Nincs email címed! Jelentkezz be Discord-dal.' }, 400);

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

  const token = await getGoogleToken(env);
  const calEvent = await createCalendarEvent(env, token, event.title, event.description, event.start_time, event.end_time, user.email);

  await env.DB.prepare('INSERT INTO bookings (event_id, user_id, email, username, calendar_event_id, created_at) VALUES (?1,?2,?3,?4,?5,?6)')
    .bind(event_id, user.id, user.email, user.username, calEvent.id || '', Date.now()).run();

  const startStr = new Date(event.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const unsubUrl = `https://mk.gekox1111.workers.dev/event/unsubscribe?email=${encodeURIComponent(user.email)}`;
  await sendEmail(env, token, user.email,
    `✅ Sikeres jelentkezés – ${event.title}`,
    `<div style="font-family:Arial,sans-serif;background:#0f1826;color:#dce8f5;padding:32px;border-radius:16px;max-width:520px">
      <h2 style="color:#22c55e">✅ Sikeres jelentkezés!</h2>
      <h3>${event.title}</h3>
      <p style="color:#8fa4bc">${event.description || ''}</p>
      <p style="margin-top:16px"><b>⏰ Időpont:</b> ${startStr}</p>
      <p style="margin-top:8px;color:#8fa4bc">A Google Calendar meghívót elküldük az email címedre.</p>
      <p style="margin-top:24px;font-size:12px;color:#4a6580"><a href="${unsubUrl}" style="color:#4a6580">Leiratkozás az értesítőkről</a></p>
    </div>`
  );

  return jsonRes({ ok: true, calendar_event: calEvent.htmlLink || null });
}

// ---- GET /event/unsubscribe ----
async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response('Hiányzó email', { status: 400 });
  await env.DB.prepare('UPDATE users SET email=NULL WHERE email=?1').bind(email).run();
  return new Response('<html><body style="font-family:Arial;background:#0f1826;color:#dce8f5;display:flex;align-items:center;justify-content:center;height:100vh"><h2>✅ Sikeresen leiratkoztál az értesítőkről.</h2></body></html>', { headers: { 'Content-Type': 'text/html' } });
}

// ---- Discord OAuth callback ----
async function handleDiscordCallback(url, request, env) {
  const code = url.searchParams.get('code');
  if (!code) return jsonRes({ error: 'Missing code' }, 400);
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code, redirect_uri: env.REDIRECT_URI,
    }),
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
  const payload = { id: dUser.id, discord_id: dUser.id, username: dUser.username, avatar: dUser.avatar, email: dUser.email || null, roblox_username: null, isAdmin, exp: now + 86400000 };
  const token = await signToken(payload, env.JWT_SECRET);
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
