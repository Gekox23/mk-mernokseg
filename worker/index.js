// =============================================
// Mezőkovácsházi Mérnökség - Full Worker Backend
// =============================================

const ADMINS = ['daniell5818'];

const WEBHOOK_EVENTS  = 'https://discord.com/api/webhooks/1506767270062457023/Pf-ZYkhTAj1R_QKm4YDB7CfSXLiUXjf1oMNVGxE-i8QVRIWS316fjK4-qgHxk7Pl4tVk';
const WEBHOOK_OKTATAS = 'https://discord.com/api/webhooks/1506772218556711064/I7nV6_NFGWp0H5mEfq_UHx7ZSTzdopyN_e4re8e-7Ioi6UqXwT4DiwAEkIZCeEmLgcxj';
const WEBHOOK_LOG     = 'https://discord.com/api/webhooks/1506768409038426144/55NhExpjToN7nj5ScGAsRT6mp-2b41c2OMQYhpGmpM01QuXgU8789xtXQwHbHoIW8k9j';

const WEBHOOK_EVENTS_ID     = '1506767270062457023';
const WEBHOOK_OKTATAS_ID    = '1506772218556711064';
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
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
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

async function sendEmbedWithFile(webhookUrl, embed, fileBlob, fileName) {
  try {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ embeds: [embed] }));
    form.append('files[0]', fileBlob, fileName);
    const r = await fetch(webhookUrl + '?wait=true', { method: 'POST', body: form });
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
      method: 'DELETE'
    });
  } catch (_) {}
}

function webhookForType(type) {
  return type === 'foglalas'
    ? { url: WEBHOOK_OKTATAS, id: WEBHOOK_OKTATAS_ID, token: WEBHOOK_OKTATAS_TOKEN, key: 'foglalas' }
    : { url: WEBHOOK_EVENTS,  id: WEBHOOK_EVENTS_ID,  token: WEBHOOK_EVENTS_TOKEN,  key: 'events'  };
}

function buildEmbed(ev, bookedCount) {
  const startStr  = new Date(ev.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const endStr    = new Date(ev.end_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const bookUrl   = `https://gekox23.github.io/mk-mernokseg/foglalas.html?event=${ev.id}`;
  const siteUrl   = 'https://gekox23.github.io/mk-mernokseg/';
  const descBlock = ev.description ? `# ${ev.title}\n${ev.description}` : `# ${ev.title}`;
  const slots     = ev.max_slots > 0 ? `${bookedCount}/${ev.max_slots} fő` : 'Korlátlan';

  if (ev.type === 'toborzas') return {
    title: '🎮 Magyar Közút toborzást hirdetett!', description: descBlock, color: 0xef7a14, image: { url: IMG_TOBORZAS },
    fields: [
      { name: '⏰ Kezdés',      value: startStr, inline: true },
      { name: '⏳ Vége',        value: endStr,   inline: true },
      { name: '👥 Férőhelyek',  value: slots,    inline: true },
      { name: '🔗 Jelentkezés', value: `[✅ Jelentkezem a toborzásra!](${bookUrl})`, inline: false },
    ],
    footer: { text: 'Mezőkovácsházi Mérnökség' }, timestamp: new Date().toISOString(),
  };
  if (ev.type === 'foglalas') return {
    title: '📚 Új oktatás került meghirdetésre!', description: descBlock, color: 0x22c55e, image: { url: IMG_OKTATAS },
    fields: [
      { name: '👤 Oktató',      value: ev.creator_name || ev.title, inline: false },
      { name: '⏰ Kezdés',      value: startStr, inline: true },
      { name: '⏳ Vége',        value: endStr,   inline: true },
      { name: '👥 Férőhelyek',  value: slots,    inline: true },
      { name: '🔗 Jelentkezés', value: `[✅ Jelentkezem az oktatásra!](${bookUrl})`, inline: false },
    ],
    footer: { text: 'Mezőkovácsházi Mérnökség' }, timestamp: new Date().toISOString(),
  };
  return {
    title: '🚧 Útinfo', description: descBlock, color: 0x3b82f6, image: { url: IMG_UTINFO },
    fields: [
      { name: '⏰ Érvényes ettől', value: startStr, inline: true },
      { name: '⏳ Érvényes eddig', value: endStr,   inline: true },
      { name: '🌐 További info',   value: `[Weboldal megnyitása](${siteUrl})`, inline: false },
    ],
    footer: { text: 'Mezőkovácsházi Mérnökség' }, timestamp: new Date().toISOString(),
  };
}
async function initDB(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, discord_id TEXT UNIQUE, roblox_id TEXT, discord_username TEXT, roblox_username TEXT, email TEXT, is_admin INTEGER DEFAULT 0, is_supervisor INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, ip TEXT, user_agent TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, username TEXT, avatar TEXT, message TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, type TEXT, start_time INTEGER, end_time INTEGER, max_slots INTEGER DEFAULT 0, created_by TEXT, creator_name TEXT, discord_message_id TEXT, discord_webhook_type TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, user_id TEXT, email TEXT, username TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id TEXT, username TEXT, subject TEXT, status TEXT DEFAULT \'idle\', claimed_by TEXT, claimed_by_name TEXT, opened_at INTEGER, claimed_at INTEGER, closed_at INTEGER, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS ticket_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, user_id TEXT, username TEXT, message TEXT, is_staff INTEGER DEFAULT 0, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS projektek (id TEXT PRIMARY KEY, name TEXT, description TEXT, deadline TEXT, created_by TEXT, creator_name TEXT, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS projekt_tagok (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, user_id TEXT, username TEXT, joined_at INTEGER)').run();

  for (const col of [
    'ALTER TABLE users ADD COLUMN is_supervisor INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN is_worker INTEGER DEFAULT 0',
    'ALTER TABLE events ADD COLUMN creator_name TEXT',
    'ALTER TABLE events ADD COLUMN discord_message_id TEXT',
    'ALTER TABLE events ADD COLUMN discord_webhook_type TEXT',
  ]) { try { await env.DB.prepare(col).run(); } catch(_) {} }
}

// ── AUTH ──────────────────────────────────────────────────────────────────
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
  const sig  = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))));
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

// ── PROJEKTEK ─────────────────────────────────────────────────────────────
async function handleGetProjektek(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const rows = await env.DB.prepare('SELECT * FROM projektek ORDER BY created_at DESC').all();
  const tagRows = await env.DB.prepare('SELECT project_id FROM projekt_tagok WHERE user_id=?1').bind(user.id).all();
  const tagSet = new Set(tagRows.results.map(r => r.project_id));
  return jsonRes(rows.results.map(p => ({ ...p, joined: tagSet.has(p.id) })));
}

async function handleCreateProjekt(request, env) {
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { name, description, deadline } = await request.json();
  if (!name) return jsonRes({ error: 'Hiányzó név' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO projektek (id, name, description, deadline, created_by, creator_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)'
  ).bind(id, name, description || '', deadline || null, user.id, user.username, Date.now()).run();
  await sendEmbed(WEBHOOK_LOG, {
    title: '📁 Új projekt létrehozva',
    description: `**${user.username}** létrehozta: **${name}**`,
    color: 0xef7a14,
    fields: [
      { name: 'Leírás',   value: description || '—', inline: false },
      { name: 'Határidő', value: deadline    || '—', inline: true  },
    ],
    timestamp: new Date().toISOString()
  });
  return jsonRes({ ok: true, id });
}

async function handleJoinProjekt(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { project_id } = await request.json();
  if (!project_id) return jsonRes({ error: 'Hiányzó project_id' }, 400);

  // Admin több projektben is lehet
  if (!user.isAdmin) {
    const existing = await env.DB.prepare(
      'SELECT id FROM projekt_tagok WHERE user_id=?1'
    ).bind(user.id).first();
    if (existing) return jsonRes({ error: 'Már tagja vagy egy projektnek!' }, 409);

    const pending = await env.DB.prepare(
      'SELECT id FROM projekt_join_requests WHERE user_id=?1 AND status=\'pending\''
    ).bind(user.id).first();
    if (pending) return jsonRes({ error: 'Már van függőben lévő kérelmed!' }, 409);
  }

  const already = await env.DB.prepare(
    'SELECT id FROM projekt_tagok WHERE project_id=?1 AND user_id=?2'
  ).bind(project_id, user.id).first();
  if (already) return jsonRes({ error: 'Már tag vagy!' }, 409);

  await env.DB.prepare(
    'INSERT INTO projekt_join_requests (project_id, user_id, username, status, created_at) VALUES (?1,?2,?3,\'pending\',?4)'
  ).bind(project_id, user.id, user.username, Date.now()).run();

  return jsonRes({ ok: true, pending: true });
}

async function handleJoinAccept(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { request_id } = await request.json();
  const req = await env.DB.prepare('SELECT * FROM projekt_join_requests WHERE id=?1').bind(request_id).first();
  if (!req) return jsonRes({ error: 'Nem található' }, 404);
  await env.DB.prepare(
    'INSERT INTO projekt_tagok (project_id, user_id, username, joined_at) VALUES (?1,?2,?3,?4)'
  ).bind(req.project_id, req.user_id, req.username, Date.now()).run();
  await env.DB.prepare(
    'UPDATE projekt_join_requests SET status=\'accepted\' WHERE id=?1'
  ).bind(request_id).run();
  return jsonRes({ ok: true });
}

async function handleJoinReject(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { request_id } = await request.json();
  await env.DB.prepare(
    'UPDATE projekt_join_requests SET status=\'rejected\' WHERE id=?1'
  ).bind(request_id).run();
  return jsonRes({ ok: true });
}

async function handleGetPending(request, env) {
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const url = new URL(request.url);
  const project_id = url.searchParams.get('id');
  const rows = await env.DB.prepare(
    'SELECT * FROM projekt_join_requests WHERE project_id=?1 AND status=\'pending\' ORDER BY created_at ASC'
  ).bind(project_id).all();
  return jsonRes(rows.results);
}

async function handleFeladatokMe(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const rows = await env.DB.prepare(
    `SELECT p.* FROM projektek p
     INNER JOIN projekt_tagok t ON t.project_id = p.id
     WHERE t.user_id = ?1
     ORDER BY p.created_at DESC`
  ).bind(user.id).all();
  return jsonRes(rows.results);
}

// ── KÉP FELTÖLTÉS ─────────────────────────────────────────────────────────
async function handleImageUpload(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);

  let formData;
  try { formData = await request.formData(); }
  catch(e) { return jsonRes({ error: 'FormData parse hiba' }, 400); }

  const file       = formData.get('file');
  const webhookUrl = formData.get('webhook');
  const title      = formData.get('title')       || 'Feltöltött kép';
  const desc       = formData.get('description') || '';

  if (!file || !webhookUrl) return jsonRes({ error: 'Hiányzó file vagy webhook' }, 400);

  const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
  if (!allowed.includes(file.type)) return jsonRes({ error: 'Csak kép fájl engedélyezett!' }, 400);

  const buf = await file.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) return jsonRes({ error: 'Max 8MB!' }, 400);

  const blob     = new Blob([buf], { type: file.type });
  const ext      = file.type.split('/')[1] || 'jpg';
  const fileName = `mk_${Date.now()}.${ext}`;

  const embed = {
    title,
    description: desc,
    color: 0xef7a14,
    image: { url: `attachment://${fileName}` },
    footer: { text: `Feltöltötte: ${user.username}` },
    timestamp: new Date().toISOString()
  };

  const msgId = await sendEmbedWithFile(webhookUrl, embed, blob, fileName);
  if (!msgId) return jsonRes({ error: 'Discord feltöltés sikertelen' }, 502);
  return jsonRes({ ok: true, message_id: msgId });
}
// ── ADMIN ─────────────────────────────────────────────────────────────────
async function handleAdminUsers(request, env) {
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Forbidden' }, 403);
  const rows = await env.DB.prepare(
    'SELECT id, discord_username, email, is_admin, is_supervisor, is_worker, created_at FROM users ORDER BY created_at DESC'
  ).all();
  return jsonRes(rows.results);
}

async function handleSetSupervisor(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin)
    return jsonRes({ error: 'Csak admin jelölhet ki supervisort!' }, 403);
  const { user_id, value } = await request.json();
  if (!user_id) return jsonRes({ error: 'Hiányzó user_id' }, 400);
  if (value) {
    await env.DB.prepare('UPDATE users SET is_supervisor=1, is_worker=0 WHERE id=?1').bind(user_id).run();
  } else {
    await env.DB.prepare('UPDATE users SET is_supervisor=0 WHERE id=?1').bind(user_id).run();
  }
  await sendEmbed(WEBHOOK_LOG, {
    title: value ? '⭐ Supervisor kijelölve' : '❌ Supervisor elvetve',
    description: `**${user.username}** ${value ? 'supervisorrá jelölt' : 'elvette a supervisor jogot'} (user_id: ${user_id})`,
    color: value ? 0x93c5fd : 0x64748b,
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}

async function handleSetWorker(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { user_id, value } = await request.json();
  if (!user_id) return jsonRes({ error: 'Hiányzó user_id' }, 400);
  const target = await env.DB.prepare(
    'SELECT is_admin, is_supervisor FROM users WHERE id=?1'
  ).bind(user_id).first();
  if (!target) return jsonRes({ error: 'Felhasználó nem található' }, 404);
  if (target.is_admin) return jsonRes({ error: 'Admin jogait nem módosíthatod!' }, 403);
  if (target.is_supervisor && !user.isAdmin)
    return jsonRes({ error: 'Supervisor jogait csak admin módosíthatja!' }, 403);
  await env.DB.prepare('UPDATE users SET is_worker=?1 WHERE id=?2').bind(value ? 1 : 0, user_id).run();
  await sendEmbed(WEBHOOK_LOG, {
    title: value ? '👷 Dolgozó kijelölve' : '❌ Dolgozó jog elvetve',
    description: `**${user.username}** ${value ? 'dolgozóvá jelölt' : 'elvette a dolgozó jogot'} (user_id: ${user_id})`,
    color: value ? 0x86efac : 0x64748b,
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}

// ── EVENTS ────────────────────────────────────────────────────────────────
async function handleGetEvents(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  return jsonRes(rows.results);
}

async function handleCreateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { title, description, type, start_time, end_time, max_slots } = await request.json();
  if (!title || !start_time || !end_time || !type)
    return jsonRes({ error: 'Hiányzó mezők' }, 400);
  if (user.isSupervisor && !user.isAdmin && type !== 'foglalas')
    return jsonRes({ error: 'Supervisor csak oktatást hozhat létre!' }, 403);
  const id = crypto.randomUUID();
  const ev = {
    id, title,
    description: description || '',
    type, start_time, end_time,
    max_slots: max_slots || 0,
    created_by: user.id,
    creator_name: user.username
  };
  await env.DB.prepare(
    'INSERT INTO events (id, title, description, type, start_time, end_time, max_slots, created_by, creator_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)'
  ).bind(id, title, ev.description, type, start_time, end_time, ev.max_slots, user.id, user.username, Date.now()).run();
  const wh    = webhookForType(type);
  const msgId = await sendEmbed(wh.url, buildEmbed(ev, 0));
  if (msgId) {
    await env.DB.prepare('UPDATE events SET discord_message_id=?1, discord_webhook_type=?2 WHERE id=?3')
      .bind(msgId, wh.key, id).run();
  }
  await sendEmbed(WEBHOOK_LOG, {
    title: '📝 Log: új esemény',
    description: `**${user.username}** létrehozta: **${title}** (${type})`,
    color: 0x8fa4bc,
    timestamp: new Date().toISOString()
  });
  return jsonRes({ ok: true, id });
}

async function handleUpdateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { event_id, title, description, start_time, end_time, max_slots } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!ev) return jsonRes({ error: 'Nem található' }, 404);
  if (!user.isAdmin && ev.created_by !== user.id)
    return jsonRes({ error: 'Csak a saját eseményedet szerkesztheted!' }, 403);
  const newTitle = title       ?? ev.title;
  const newDesc  = description ?? ev.description;
  const newStart = start_time  ?? ev.start_time;
  const newEnd   = end_time    ?? ev.end_time;
  const newSlots = max_slots   ?? ev.max_slots;
  await env.DB.prepare(
    'UPDATE events SET title=?1, description=?2, start_time=?3, end_time=?4, max_slots=?5 WHERE id=?6'
  ).bind(newTitle, newDesc, newStart, newEnd, newSlots, event_id).run();
  const updEv    = { ...ev, title: newTitle, description: newDesc, start_time: newStart, end_time: newEnd, max_slots: newSlots };
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
  if (ev.discord_message_id) {
    const wh = webhookForType(ev.type);
    await editEmbed(wh.id, wh.token, ev.discord_message_id, buildEmbed(updEv, countRow?.c || 0));
  }
  await sendEmbed(WEBHOOK_LOG, {
    title: '✏️ Log: esemény szerkesztve',
    description: `**${user.username}** szerkesztette: **${newTitle}**`,
    color: 0x8fa4bc,
    timestamp: new Date().toISOString()
  });
  return jsonRes({ ok: true });
}

async function handleDeleteEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { event_id } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hiányzó event_id' }, 400);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!ev) return jsonRes({ error: 'Nem található' }, 404);
  if (!user.isAdmin && ev.created_by !== user.id)
    return jsonRes({ error: 'Csak a saját eseményedet törölheted!' }, 403);
  if (ev.discord_message_id) {
    const wh = webhookForType(ev.type);
    await deleteMessage(wh.id, wh.token, ev.discord_message_id);
  }
  await env.DB.prepare('DELETE FROM bookings WHERE event_id=?1').bind(event_id).run();
  await env.DB.prepare('DELETE FROM events WHERE id=?1').bind(event_id).run();
  await sendEmbed(WEBHOOK_LOG, {
    title: '🗑️ Log: esemény törölve',
    description: `**${user.username}** törölte: **${ev.title}**`,
    color: 0xe74c3c,
    timestamp: new Date().toISOString()
  });
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
  const existing = await env.DB.prepare(
    'SELECT id FROM bookings WHERE event_id=?1 AND user_id=?2'
  ).bind(event_id, user.id).first();
  if (existing) return jsonRes({ error: 'Már jelentkeztél erre az eseményre!' }, 409);
  const countRow    = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
  const bookedCount = countRow?.c || 0;
  if (event.max_slots > 0 && bookedCount >= event.max_slots)
    return jsonRes({ error: 'Nincs több szabad hely!' }, 400);
  await env.DB.prepare(
    'INSERT INTO bookings (event_id, user_id, email, username, created_at) VALUES (?1,?2,?3,?4,?5)'
  ).bind(event_id, user.id, user.email || '', user.username, Date.now()).run();
  const newCount = bookedCount + 1;
  if (event.discord_message_id) {
    const wh = webhookForType(event.type);
    await editEmbed(wh.id, wh.token, event.discord_message_id, buildEmbed(event, newCount));
  }
  const startStr = new Date(event.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  await sendEmbed(WEBHOOK_LOG, {
    title: '✅ Log: új jelentkezés',
    description: `**${user.username}** jelentkezett: **${event.title}**`,
    color: 0x22c55e,
    fields: [
      { name: '⏰ Időpont', value: startStr,       inline: true },
      { name: '📧 Email',   value: user.email || 'nincs', inline: true }
    ],
    timestamp: new Date().toISOString()
  });
  return jsonRes({ ok: true });
}

async function handleUnsubscribe(request, env) {
  const url   = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response('Hiányzó email', { status: 400, headers: CORS });
  await env.DB.prepare('UPDATE users SET email=NULL WHERE email=?1').bind(email).run();
  return new Response(
    '<html><body style="font-family:Arial;background:#0f1826;color:#dce8f5;display:flex;align-items:center;justify-content:center;height:100vh"><h2>✅ Sikeresen leiratkoztál az értesítőkről.</h2></body></html>',
    { headers: { 'Content-Type': 'text/html', ...CORS } }
  );
}
// ── TICKET ────────────────────────────────────────────────────────────────
async function handleTicketCreate(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges!' }, 401);
  const { subject, first_message } = await request.json();
  const id  = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO tickets (id, user_id, username, subject, status, opened_at, created_at) VALUES (?1,?2,?3,?4,\'idle\',?5,?5)'
  ).bind(id, user.id, user.username, subject || 'Segítség kérés', now).run();
  if (first_message) {
    await env.DB.prepare(
      'INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff, created_at) VALUES (?1,?2,?3,?4,0,?5)'
    ).bind(id, user.id, user.username, first_message, now).run();
  }
  await sendEmbed(WEBHOOK_LOG, {
    title: '🎫 Új ticket nyitva',
    description: `**${user.username}** segítséget kér: **${subject || 'Segítség kérés'}**`,
    color: 0xf59e0b,
    fields: [{ name: 'Ticket ID', value: id, inline: false }],
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true, id });
}

async function handleTicketList(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  if (user.isAdmin || user.isSupervisor) {
    const rows = await env.DB.prepare('SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50').all();
    return jsonRes(rows.results);
  }
  const rows = await env.DB.prepare(
    'SELECT * FROM tickets WHERE user_id=?1 ORDER BY created_at DESC'
  ).bind(user.id).all();
  return jsonRes(rows.results);
}

async function handleTicketClaim(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor))
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { ticket_id } = await request.json();
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem található' }, 404);
  if (ticket.claimed_by && ticket.claimed_by !== user.id && !user.isAdmin)
    return jsonRes({ error: 'Már valaki kezeli ezt a ticketet!' }, 409);
  await env.DB.prepare(
    'UPDATE tickets SET status=\'open\', claimed_by=?1, claimed_by_name=?2, claimed_at=?3 WHERE id=?4'
  ).bind(user.id, user.username, Date.now(), ticket_id).run();
  await env.DB.prepare(
    'INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff, created_at) VALUES (?1,?2,?3,?4,1,?5)'
  ).bind(ticket_id, user.id, user.username, `👋 **${user.username}** átvette a ticketet.`, Date.now()).run();
  return jsonRes({ ok: true });
}

async function handleTicketUnclaim(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Csak admin adhatja vissza!' }, 403);
  const { ticket_id } = await request.json();
  await env.DB.prepare(
    'UPDATE tickets SET status=\'idle\', claimed_by=NULL, claimed_by_name=NULL, claimed_at=NULL WHERE id=?1'
  ).bind(ticket_id).run();
  return jsonRes({ ok: true });
}

async function handleTicketClose(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { ticket_id } = await request.json();
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem található' }, 404);
  if (!user.isAdmin && ticket.claimed_by !== user.id && ticket.user_id !== user.id)
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE tickets SET status=\'closed\', closed_at=?1 WHERE id=?2'
  ).bind(now, ticket_id).run();
  const msgs = await env.DB.prepare(
    'SELECT * FROM ticket_messages WHERE ticket_id=?1 ORDER BY created_at ASC'
  ).bind(ticket_id).all();
  const lines = msgs.results.map(m => {
    const t      = new Date(m.created_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
    const prefix = m.is_staff ? '🛡️ STAFF' : '👤 USER';
    return `[${t}] ${prefix} ${m.username}: ${m.message}`;
  }).join('\n');
  const openedStr  = new Date(ticket.opened_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const claimedStr = ticket.claimed_at
    ? new Date(ticket.claimed_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })
    : 'nem vette át senki';
  const closedStr  = new Date(now).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const duration   = ticket.claimed_at ? Math.round((now - ticket.claimed_at) / 60000) : null;
  await sendEmbed(WEBHOOK_LOG, {
    title: '🎫 Ticket lezárva',
    description: lines.length > 3800 ? lines.slice(0, 3800) + '\n...[csonkítva]' : (lines || 'Nincs üzenet'),
    color: 0x64748b,
    fields: [
      { name: '👤 Felhasználó', value: ticket.username,              inline: true  },
      { name: '🛡️ Kezelő',     value: ticket.claimed_by_name || 'senki', inline: true },
      { name: '📌 Téma',        value: ticket.subject || '-',        inline: false },
      { name: '🕒 Megnyitva',   value: openedStr,                    inline: true  },
      { name: '🔒 Átvette',     value: claimedStr,                   inline: true  },
      { name: '✅ Lezárva',     value: closedStr,                    inline: true  },
      { name: '⏱️ Időtartam',   value: duration !== null ? `${duration} perc` : 'n/a', inline: true },
      { name: '📝 Üzenetek',    value: String(msgs.results.length),  inline: true  },
    ],
    footer: { text: `Ticket ID: ${ticket_id}` },
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}

async function handleTicketMessages(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const url       = new URL(request.url);
  const ticket_id = url.searchParams.get('id');
  if (!ticket_id) return jsonRes({ error: 'Hiányzó id' }, 400);
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem található' }, 404);
  if (!user.isAdmin && !user.isSupervisor && ticket.user_id !== user.id)
    return jsonRes({ error: 'Nincs hozzáférésed!' }, 403);
  const rows = await env.DB.prepare(
    'SELECT * FROM ticket_messages WHERE ticket_id=?1 ORDER BY created_at ASC'
  ).bind(ticket_id).all();
  return jsonRes({ ticket, messages: rows.results });
}

async function handleTicketSend(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { ticket_id, message } = await request.json();
  if (!ticket_id || !message) return jsonRes({ error: 'Hiányzó adatok' }, 400);
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem található' }, 404);
  if (ticket.status === 'closed') return jsonRes({ error: 'A ticket le van zárva!' }, 400);
  if (!user.isAdmin && !user.isSupervisor && ticket.user_id !== user.id)
    return jsonRes({ error: 'Nincs hozzáférésed!' }, 403);
  const isStaff = (user.isAdmin || user.isSupervisor) ? 1 : 0;
  await env.DB.prepare(
    'INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff, created_at) VALUES (?1,?2,?3,?4,?5,?6)'
  ).bind(ticket_id, user.id, user.username, message.slice(0, 1000), isStaff, Date.now()).run();
  return jsonRes({ ok: true });
}

// ── CHAT ──────────────────────────────────────────────────────────────────
async function handleChatSend(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Belépés szükséges a chathez!' }, 401);
  const body = await request.json();
  const msg  = (body.message || '').trim().slice(0, 500);
  if (!msg) return jsonRes({ error: 'Üres üzenet' }, 400);
  await env.DB.prepare(
    'INSERT INTO chat (user_id, username, avatar, message, created_at) VALUES (?1,?2,?3,?4,?5)'
  ).bind(user.id, user.username, user.avatar || null, msg, Date.now()).run();
  await env.DB.prepare(
    'INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)'
  ).bind(user.id, 'chat_send', request.headers.get('CF-Connecting-IP') || 'unknown', request.headers.get('User-Agent') || '', Date.now()).run();
  return jsonRes({ ok: true });
}

async function handleChatMessages(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM chat ORDER BY created_at DESC LIMIT 50').all();
  return jsonRes(rows.results.reverse());
}

// ── ME + LOG ──────────────────────────────────────────────────────────────
async function handleMe(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const dbUser = await env.DB.prepare(
    'SELECT is_supervisor, is_worker, is_admin FROM users WHERE id=?1'
  ).bind(user.id).first();
  if (dbUser) {
    user.isSupervisor = dbUser.is_supervisor === 1;
    user.isWorker     = dbUser.is_worker     === 1;
    user.isAdmin      = dbUser.is_admin      === 1;
  }
  return jsonRes(user);
}

async function handleLog(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  const body = await request.json().catch(() => ({}));
  const ip   = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare(
    'INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)'
  ).bind(user?.id || 'anonymous', body.action || 'unknown', ip, request.headers.get('User-Agent') || '', Date.now()).run();
  return jsonRes({ ok: true });
}

// ── DISCORD CALLBACK ──────────────────────────────────────────────────────
async function handleDiscordCallback(url, request, env) {
  const code = url.searchParams.get('code');
  if (!code) return jsonRes({ error: 'Missing code' }, 400);
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  env.REDIRECT_URI
    })
  });
  if (!tokenRes.ok) return jsonRes({ error: 'Token exchange failed' }, 401);
  const tokenData = await tokenRes.json();
  const userRes   = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (!userRes.ok) return jsonRes({ error: 'Failed to fetch user' }, 401);
  const dUser  = await userRes.json();
  const isAdmin = ADMINS.includes(dUser.username.toLowerCase());
  const now     = Date.now();
  await env.DB.prepare(
    'INSERT INTO users (id, discord_id, discord_username, email, is_admin, created_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, email=excluded.email, is_admin=excluded.is_admin'
  ).bind(dUser.id, dUser.id, dUser.username, dUser.email || null, isAdmin ? 1 : 0, now).run();
  const dbUser = await env.DB.prepare(
    'SELECT is_supervisor, is_worker FROM users WHERE discord_id=?1'
  ).bind(dUser.id).first();
  const isSupervisor = dbUser?.is_supervisor === 1;
  const isWorker     = dbUser?.is_worker     === 1;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare(
    'INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)'
  ).bind(dUser.id, 'discord_login', ip, request.headers.get('User-Agent') || '', now).run();
  await sendEmbed(WEBHOOK_LOG, {
    title: '🔑 Log: belépés',
    description: `**${dUser.username}** bejelentkezett Discord-dal`,
    color: 0x5865f2,
    fields: [{ name: '📍 IP', value: ip, inline: true }],
    timestamp: new Date().toISOString()
  });
  const payload = {
    id:               dUser.id,
    discord_id:       dUser.id,
    username:         dUser.username,
    avatar:           dUser.avatar,
    email:            dUser.email || null,
    roblox_username:  null,
    isAdmin,
    isSupervisor,
    isWorker,
    exp: now + 86400000
  };
  const token = await signToken(payload, env.JWT_SECRET);
  return Response.redirect(`https://gekox23.github.io/mk-mernokseg/?token=${token}`, 302);
}

async function handleGetTagok(request, env) {
  const user = await authUser(request, env);
  if(!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const url = new URL(request.url);
  const project_id = url.searchParams.get('id');
  if(!project_id) return jsonRes({ error: 'Hiányzó id' }, 400);
  const proj = await env.DB.prepare('SELECT * FROM projektek WHERE id=?1').bind(project_id).first();
  if(!proj) return jsonRes({ error: 'Nem található' }, 404);
  if(!user.isAdmin && proj.created_by !== user.id)
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const rows = await env.DB.prepare(
    'SELECT * FROM projekt_tagok WHERE project_id=?1 ORDER BY joined_at ASC'
  ).bind(project_id).all();
  return jsonRes(rows.results);
}

async function handleAddTag(request, env) {
  if(request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if(!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { project_id, username } = await request.json();
  if(!project_id || !username) return jsonRes({ error: 'Hiányzó adatok' }, 400);
  const proj = await env.DB.prepare('SELECT * FROM projektek WHERE id=?1').bind(project_id).first();
  if(!proj) return jsonRes({ error: 'Projekt nem található' }, 404);
  if(!user.isAdmin && proj.created_by !== user.id)
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const target = await env.DB.prepare(
    'SELECT id FROM users WHERE discord_username=?1'
  ).bind(username).first();
  if(!target) return jsonRes({ error: 'Felhasználó nem található!' }, 404);
  const existing = await env.DB.prepare(
    'SELECT id FROM projekt_tagok WHERE project_id=?1 AND user_id=?2'
  ).bind(project_id, target.id).first();
  if(existing) return jsonRes({ error: 'Már tag!' }, 409);
  await env.DB.prepare(
    'INSERT INTO projekt_tagok (project_id, user_id, username, joined_at) VALUES (?1,?2,?3,?4)'
  ).bind(project_id, target.id, username, Date.now()).run();
  return jsonRes({ ok: true });
}

async function handleKickTag(request, env) {
  if(request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if(!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { project_id, user_id } = await request.json();
  if(!project_id || !user_id) return jsonRes({ error: 'Hiányzó adatok' }, 400);
  const proj = await env.DB.prepare('SELECT * FROM projektek WHERE id=?1').bind(project_id).first();
  if(!proj) return jsonRes({ error: 'Projekt nem található' }, 404);
  if(!user.isAdmin && proj.created_by !== user.id)
    return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  await env.DB.prepare(
    'DELETE FROM projekt_tagok WHERE project_id=?1 AND user_id=?2'
  ).bind(project_id, user_id).run();
  return jsonRes({ ok: true });
}

async function handleDeleteProjekt(request, env) {
  if(request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if(!user || !user.isAdmin) return jsonRes({ error: 'Csak admin törölhet projektet!' }, 403);
  const { project_id } = await request.json();
  if(!project_id) return jsonRes({ error: 'Hiányzó project_id' }, 400);
  await env.DB.prepare('DELETE FROM projekt_tagok WHERE project_id=?1').bind(project_id).run();
  await env.DB.prepare('DELETE FROM projektek WHERE id=?1').bind(project_id).run();
  return jsonRes({ ok: true });
}



// ── EXPORT DEFAULT (ROUTER) ───────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      await initDB(env);
      const url = new URL(request.url);

      if (url.pathname === '/callback')             return handleDiscordCallback(url, request, env);
      if (url.pathname === '/me')                   return handleMe(request, env);
      if (url.pathname === '/log')                  return handleLog(request, env);
      if (url.pathname === '/chat/send')            return handleChatSend(request, env);
      if (url.pathname === '/chat/messages')        return handleChatMessages(request, env);
      if (url.pathname === '/events')               return handleGetEvents(request, env);
      if (url.pathname === '/event/create')         return handleCreateEvent(request, env);
      if (url.pathname === '/event/update')         return handleUpdateEvent(request, env);
      if (url.pathname === '/event/book')           return handleBookSlot(request, env);
      if (url.pathname === '/event/delete')         return handleDeleteEvent(request, env);
      if (url.pathname === '/event/unsubscribe')    return handleUnsubscribe(request, env);
      if (url.pathname === '/admin/users')          return handleAdminUsers(request, env);
      if (url.pathname === '/admin/set-supervisor') return handleSetSupervisor(request, env);
      if (url.pathname === '/admin/set-worker')     return handleSetWorker(request, env);
      if (url.pathname === '/projektek' && request.method === 'GET')  return handleGetProjektek(request, env);
      if (url.pathname === '/projektek' && request.method === 'POST') return handleCreateProjekt(request, env);
      if (url.pathname === '/projektek/join')       return handleJoinProjekt(request, env);
      if (url.pathname === '/projektek/tagok')    return handleGetTagok(request, env);
      if (url.pathname === '/projektek/tag/add')  return handleAddTag(request, env);
      if (url.pathname === '/projektek/tag/kick') return handleKickTag(request, env);
      if (url.pathname === '/projektek/delete')   return handleDeleteProjekt(request, env);
      if (url.pathname === '/feladatok/me')         return handleFeladatokMe(request, env);
      if (url.pathname === '/upload/image')         return handleImageUpload(request, env);
      if (url.pathname === '/ticket/create')        return handleTicketCreate(request, env);
      if (url.pathname === '/ticket/list')          return handleTicketList(request, env);
      if (url.pathname === '/ticket/claim')         return handleTicketClaim(request, env);
      if (url.pathname === '/ticket/close')         return handleTicketClose(request, env);
      if (url.pathname === '/ticket/messages')      return handleTicketMessages(request, env);
      if (url.pathname === '/ticket/send')          return handleTicketSend(request, env);
      if (url.pathname === '/ticket/unclaim')       return handleTicketUnclaim(request, env);
      if (url.pathname === '/projektek/join/accept') return handleJoinAccept(request, env);
      if (url.pathname === '/projektek/join/reject') return handleJoinReject(request, env);
      if (url.pathname === '/projektek/join/pending') return handleGetPending(request, env);

      return new Response('MK API OK', { status: 200, headers: CORS });
    } catch (err) {
      return jsonRes({ error: 'Internal error', detail: String(err) }, 500);
    }
  }
};
