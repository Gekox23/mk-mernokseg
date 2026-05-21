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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (r.ok) { const d = await r.json(); return d.id || null; }
  } catch (_) {}
  return null;
}

async function editEmbed(webhookId, webhookToken, messageId, embed) {
  try {
    await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${messageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (_) {}
}

async function deleteMessage(webhookId, webhookToken, messageId) {
  try {
    await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${messageId}`, { method: 'DELETE' });
  } catch (_) {}
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      await initDB(env);
      const url = new URL(request.url);
      if (url.pathname === '/callback')              return handleDiscordCallback(url, request, env);
      if (url.pathname === '/me')                    return handleMe(request, env);
      if (url.pathname === '/log')                   return handleLog(request, env);
      if (url.pathname === '/chat/send')             return handleChatSend(request, env);
      if (url.pathname === '/chat/messages')         return handleChatMessages(request, env);
      if (url.pathname === '/events')                return handleGetEvents(request, env);
      if (url.pathname === '/event/create')          return handleCreateEvent(request, env);
      if (url.pathname === '/event/update')          return handleUpdateEvent(request, env);
      if (url.pathname === '/event/book')            return handleBookSlot(request, env);
      if (url.pathname === '/event/delete')          return handleDeleteEvent(request, env);
      if (url.pathname === '/event/unsubscribe')     return handleUnsubscribe(request, env);
      if (url.pathname === '/admin/users')           return handleAdminUsers(request, env);
      if (url.pathname === '/admin/set-supervisor')  return handleSetSupervisor(request, env);
      if (url.pathname === '/admin/set-worker')      return handleSetWorker(request, env);
      // ticket endpoints
      if (url.pathname === '/ticket/create')         return handleTicketCreate(request, env);
      if (url.pathname === '/ticket/list')           return handleTicketList(request, env);
      if (url.pathname === '/ticket/claim')          return handleTicketClaim(request, env);
      if (url.pathname === '/ticket/close')          return handleTicketClose(request, env);
      if (url.pathname === '/ticket/messages')       return handleTicketMessages(request, env);
      if (url.pathname === '/ticket/send')           return handleTicketSend(request, env);
      if (url.pathname === '/ticket/unclaim')        return handleTicketUnclaim(request, env);
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
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id TEXT, username TEXT, subject TEXT, status TEXT DEFAULT \'idle\', claimed_by TEXT, claimed_by_name TEXT, opened_at INTEGER, claimed_at INTEGER, closed_at INTEGER, created_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS ticket_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, user_id TEXT, username TEXT, message TEXT, is_staff INTEGER DEFAULT 0, created_at INTEGER)').run();
  // ALTER TABLE migrations - safe, duplikálás ellen védett
  for (const col of [
    'ALTER TABLE users ADD COLUMN is_supervisor INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN is_worker INTEGER DEFAULT 0',
    'ALTER TABLE events ADD COLUMN creator_name TEXT',
    'ALTER TABLE events ADD COLUMN discord_message_id TEXT',
    'ALTER TABLE events ADD COLUMN discord_webhook_type TEXT',
  ]) { try { await env.DB.prepare(col).run(); } catch(_) {} }
}

// ---- embed helpers ----
function buildEmbed(ev, bookedCount) {
  const startStr = new Date(ev.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const endStr   = new Date(ev.end_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const bookUrl  = `https://gekox23.github.io/mk-mernokseg/foglalas.html?event=${ev.id}`;
  const siteUrl  = 'https://gekox23.github.io/mk-mernokseg/';
  const descBlock = ev.description ? `# ${ev.title}\n${ev.description}` : `# ${ev.title}`;
  const slots = ev.max_slots > 0 ? `${bookedCount}/${ev.max_slots} f\u0151` : 'Korl\u00e1tlan';
  if (ev.type === 'toborzas') return {
    title: '\uD83C\uDFAE Magyar K\u00f6z\u00fat toborz\u00e1st hirdetett!', description: descBlock, color: 0xef7a14, image: { url: IMG_TOBORZAS },
    fields: [
      { name: '\u23F0 Kezd\u00e9s', value: startStr, inline: true }, { name: '\u23F3 V\u00e9ge', value: endStr, inline: true },
      { name: '\uD83D\uDC65 F\u00e9r\u0151helyek', value: slots, inline: true },
      { name: '\uD83D\uDD17 Jelentkez\u00e9s', value: `[\u2705 Jelentkezem a toborz\u00e1sra!](${bookUrl})`, inline: false },
    ],
    footer: { text: 'Mez\u0151kov\u00e1csh\u00e1zi M\u00e9rn\u00f6ks\u00e9g' }, timestamp: new Date().toISOString(),
  };
  if (ev.type === 'foglalas') return {
    title: '\uD83D\uDCDA \u00DAj oktat\u00e1s ker\u00FClt meghirdet\u00E9sre!', description: descBlock, color: 0x22c55e, image: { url: IMG_OKTATAS },
    fields: [
      { name: '\uD83D\uDC64 Oktat\u00F3', value: ev.creator_name || ev.title, inline: false },
      { name: '\u23F0 Kezd\u00e9s', value: startStr, inline: true }, { name: '\u23F3 V\u00e9ge', value: endStr, inline: true },
      { name: '\uD83D\uDC65 F\u00e9r\u0151helyek', value: slots, inline: true },
      { name: '\uD83D\uDD17 Jelentkez\u00e9s', value: `[\u2705 Jelentkezem az oktat\u00e1sra!](${bookUrl})`, inline: false },
    ],
    footer: { text: 'Mez\u0151kov\u00e1csh\u00e1zi M\u00e9rn\u00f6ks\u00e9g' }, timestamp: new Date().toISOString(),
  };
  return {
    title: '\uD83D\uDEA7 \u00DAtinfo', description: descBlock, color: 0x3b82f6, image: { url: IMG_UTINFO },
    fields: [
      { name: '\u23F0 \u00C9rv\u00e9nyes ett\u0151l', value: startStr, inline: true }, { name: '\u23F3 \u00C9rv\u00e9nyes eddig', value: endStr, inline: true },
      { name: '\uD83C\uDF10 Tov\u00e1bbi inf\u00F3', value: `[Weboldal megnyit\u00e1sa](${siteUrl})`, inline: false },
    ],
    footer: { text: 'Mez\u0151kov\u00e1csh\u00e1zi M\u00e9rn\u00f6ks\u00e9g' }, timestamp: new Date().toISOString(),
  };
}

function webhookForType(type) {
  return type === 'foglalas'
    ? { url: WEBHOOK_OKTATAS, id: WEBHOOK_OKTATAS_ID, token: WEBHOOK_OKTATAS_TOKEN, key: 'foglalas' }
    : { url: WEBHOOK_EVENTS,  id: WEBHOOK_EVENTS_ID,  token: WEBHOOK_EVENTS_TOKEN,  key: 'events' };
}

// ---- ticket handlers ----
async function handleTicketCreate(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Bel\u00e9p\u00e9s sz\u00FCks\u00e9ges!' }, 401);
  const { subject, first_message } = await request.json();
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO tickets (id, user_id, username, subject, status, opened_at, created_at) VALUES (?1,?2,?3,?4,\'idle\',?5,?5)')
    .bind(id, user.id, user.username, subject || 'Seg\u00edts\u00e9g k\u00e9r\u00e9s', now).run();
  if (first_message) {
    await env.DB.prepare('INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff, created_at) VALUES (?1,?2,?3,?4,0,?5)')
      .bind(id, user.id, user.username, first_message, now).run();
  }
  await sendEmbed(WEBHOOK_LOG, {
    title: '\uD83C\uDFAB \u00DAj ticket ny\u00edlva',
    description: `**${user.username}** seg\u00edts\u00e9get k\u00e9r: **${subject || 'Seg\u00edts\u00e9g k\u00e9r\u00e9s'}**`,
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
  const rows = await env.DB.prepare('SELECT * FROM tickets WHERE user_id=?1 ORDER BY created_at DESC').bind(user.id).all();
  return jsonRes(rows.results);
}

async function handleTicketClaim(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosults\u00e1god!' }, 403);
  const { ticket_id } = await request.json();
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem tal\u00e1lhat\u00f3' }, 404);
  if (ticket.claimed_by && ticket.claimed_by !== user.id && !user.isAdmin)
    return jsonRes({ error: 'M\u00e1r valaki kezeli ezt a ticketet!' }, 409);
  await env.DB.prepare('UPDATE tickets SET status=\'open\', claimed_by=?1, claimed_by_name=?2, claimed_at=?3 WHERE id=?4')
    .bind(user.id, user.username, Date.now(), ticket_id).run();
  await env.DB.prepare('INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff, created_at) VALUES (?1,?2,?3,?4,1,?5)')
    .bind(ticket_id, user.id, user.username, `\uD83D\uDC4B **${user.username}** \u00e1tvette a ticketet.`, Date.now()).run();
  return jsonRes({ ok: true });
}

async function handleTicketUnclaim(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Csak admin adhatja vissza!' }, 403);
  const { ticket_id } = await request.json();
  await env.DB.prepare('UPDATE tickets SET status=\'idle\', claimed_by=NULL, claimed_by_name=NULL, claimed_at=NULL WHERE id=?1').bind(ticket_id).run();
  return jsonRes({ ok: true });
}

async function handleTicketClose(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { ticket_id } = await request.json();
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem tal\u00e1lhat\u00f3' }, 404);
  if (!user.isAdmin && ticket.claimed_by !== user.id && ticket.user_id !== user.id)
    return jsonRes({ error: 'Nincs jogosults\u00e1god!' }, 403);
  const now = Date.now();
  await env.DB.prepare('UPDATE tickets SET status=\'closed\', closed_at=?1 WHERE id=?2').bind(now, ticket_id).run();
  const msgs = await env.DB.prepare('SELECT * FROM ticket_messages WHERE ticket_id=?1 ORDER BY created_at ASC').bind(ticket_id).all();
  const lines = msgs.results.map(m => {
    const t = new Date(m.created_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
    const prefix = m.is_staff ? '\uD83D\uDEE1\uFE0F STAFF' : '\uD83D\uDC64 USER';
    return `[${t}] ${prefix} ${m.username}: ${m.message}`;
  }).join('\n');
  const openedStr  = new Date(ticket.opened_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const claimedStr = ticket.claimed_at ? new Date(ticket.claimed_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }) : 'nem vette \u00e1t senki';
  const closedStr  = new Date(now).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  const duration   = ticket.claimed_at ? Math.round((now - ticket.claimed_at) / 60000) : null;
  await sendEmbed(WEBHOOK_LOG, {
    title: '\uD83C\uDFAB Ticket lez\u00E1rva',
    description: lines.length > 3800 ? lines.slice(0, 3800) + '\n...[csonk\u00edtva]' : (lines || 'Nincs \u00FCzenet'),
    color: 0x64748b,
    fields: [
      { name: '\uD83D\uDC64 Felhaszn\u00E1l\u00F3', value: ticket.username, inline: true },
      { name: '\uD83D\uDEE1\uFE0F Kezel\u0151', value: ticket.claimed_by_name || 'senki', inline: true },
      { name: '\uD83D\uDCCC T\u00E9ma', value: ticket.subject || '-', inline: false },
      { name: '\uD83D\uDD52 Megnyitva', value: openedStr, inline: true },
      { name: '\uD83D\uDD12 \u00C1tvette', value: claimedStr, inline: true },
      { name: '\u2705 Lez\u00E1rva', value: closedStr, inline: true },
      { name: '\u23F1\uFE0F Id\u0151tartam', value: duration !== null ? `${duration} perc` : 'n/a', inline: true },
      { name: '\uD83D\uDCDD \u00DCzenetek sz\u00E1ma', value: String(msgs.results.length), inline: true },
    ],
    footer: { text: `Ticket ID: ${ticket_id}` },
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}

async function handleTicketMessages(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const url = new URL(request.url);
  const ticket_id = url.searchParams.get('id');
  if (!ticket_id) return jsonRes({ error: 'Hi\u00e1nyz\u00f3 id' }, 400);
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem tal\u00e1lhat\u00f3' }, 404);
  if (!user.isAdmin && !user.isSupervisor && ticket.user_id !== user.id)
    return jsonRes({ error: 'Nincs hozz\u00e1f\u00e9r\u00e9sed!' }, 403);
  const rows = await env.DB.prepare('SELECT * FROM ticket_messages WHERE ticket_id=?1 ORDER BY created_at ASC').bind(ticket_id).all();
  return jsonRes({ ticket, messages: rows.results });
}

async function handleTicketSend(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  const { ticket_id, message } = await request.json();
  if (!ticket_id || !message) return jsonRes({ error: 'Hi\u00e1nyz\u00f3 adatok' }, 400);
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?1').bind(ticket_id).first();
  if (!ticket) return jsonRes({ error: 'Nem tal\u00e1lhat\u00f3' }, 404);
  if (ticket.status === 'closed') return jsonRes({ error: 'A ticket le van z\u00e1rva!' }, 400);
  if (!user.isAdmin && !user.isSupervisor && ticket.user_id !== user.id)
    return jsonRes({ error: 'Nincs hozz\u00e1f\u00e9r\u00e9sed!' }, 403);
  const isStaff = user.isAdmin || user.isSupervisor ? 1 : 0;
  await env.DB.prepare('INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff, created_at) VALUES (?1,?2,?3,?4,?5,?6)')
    .bind(ticket_id, user.id, user.username, message.slice(0, 1000), isStaff, Date.now()).run();
  return jsonRes({ ok: true });
}

// ---- admin handlers ----

// /admin/users - Admin és Supervisor is láthatja
async function handleAdminUsers(request, env) {
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Forbidden' }, 403);
  const rows = await env.DB.prepare(
    'SELECT id, discord_username, email, is_admin, is_supervisor, is_worker, created_at FROM users ORDER BY created_at DESC'
  ).all();
  return jsonRes(rows.results);
}

// /admin/set-supervisor - CSAK ADMIN
async function handleSetSupervisor(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || !user.isAdmin) return jsonRes({ error: 'Csak admin jelölhet ki supervisort!' }, 403);
  const { user_id, value } = await request.json();
  if (!user_id) return jsonRes({ error: 'Hiányzó user_id' }, 400);
  // Ha supervisorrá tesszük, a worker jogot levesszük (supervisor > worker)
  if (value) {
    await env.DB.prepare('UPDATE users SET is_supervisor=1, is_worker=0 WHERE id=?1').bind(user_id).run();
  } else {
    await env.DB.prepare('UPDATE users SET is_supervisor=0 WHERE id=?1').bind(user_id).run();
  }
  await sendEmbed(WEBHOOK_LOG, {
    title: value ? '\u2B50 Supervisor kijelölve' : '\u274c Supervisor elvetve',
    description: `**${user.username}** ${value ? 'supervisorrá jelölt' : 'elvette a supervisor jogot'} (user_id: ${user_id})`,
    color: value ? 0x93c5fd : 0x64748b,
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}

// /admin/set-worker - ADMIN ÉS SUPERVISOR
async function handleSetWorker(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosultságod!' }, 403);
  const { user_id, value } = await request.json();
  if (!user_id) return jsonRes({ error: 'Hiányzó user_id' }, 400);
  // Supervisor nem tehet supervisort dolgozóvá
  const target = await env.DB.prepare('SELECT is_admin, is_supervisor FROM users WHERE id=?1').bind(user_id).first();
  if (!target) return jsonRes({ error: 'Felhasználó nem található' }, 404);
  if (target.is_admin) return jsonRes({ error: 'Admin jogait nem módosíthatod!' }, 403);
  if (target.is_supervisor && !user.isAdmin) return jsonRes({ error: 'Supervisor jogait csak admin módosíthatja!' }, 403);
  await env.DB.prepare('UPDATE users SET is_worker=?1 WHERE id=?2').bind(value ? 1 : 0, user_id).run();
  await sendEmbed(WEBHOOK_LOG, {
    title: value ? '\uD83D\uDC77 Dolgozó kijelölve' : '\u274c Dolgozó jog elvetve',
    description: `**${user.username}** ${value ? 'dolgozóvá jelölt' : 'elvette a dolgozó jogot'} (user_id: ${user_id})`,
    color: value ? 0x86efac : 0x64748b,
    timestamp: new Date().toISOString(),
  });
  return jsonRes({ ok: true });
}

// ---- existing handlers ----
async function handleDeleteEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosults\u00e1god!' }, 403);
  const { event_id } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hi\u00e1nyz\u00f3 event_id' }, 400);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!ev) return jsonRes({ error: 'Nem tal\u00e1lhat\u00f3' }, 404);
  if (!user.isAdmin && ev.created_by !== user.id) return jsonRes({ error: 'Csak a saj\u00e1t esem\u00e9nyedet t\u00f6r\u00f6lheted!' }, 403);
  if (ev.discord_message_id) { const wh = webhookForType(ev.type); await deleteMessage(wh.id, wh.token, ev.discord_message_id); }
  await env.DB.prepare('DELETE FROM bookings WHERE event_id=?1').bind(event_id).run();
  await env.DB.prepare('DELETE FROM events WHERE id=?1').bind(event_id).run();
  await sendEmbed(WEBHOOK_LOG, { title: '\uD83D\uDDD1\uFE0F Log: esem\u00e9ny t\u00f6r\u00f6lve', description: `**${user.username}** t\u00f6r\u00f6lte: **${ev.title}**`, color: 0xe74c3c, timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}
async function handleGetEvents(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  return jsonRes(rows.results);
}
async function handleCreateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosults\u00e1god!' }, 403);
  const { title, description, type, start_time, end_time, max_slots } = await request.json();
  if (!title || !start_time || !end_time || !type) return jsonRes({ error: 'Hi\u00e1nyz\u00f3 mez\u0151k' }, 400);
  if (user.isSupervisor && !user.isAdmin && type !== 'foglalas') return jsonRes({ error: 'Supervisor csak oktat\u00e1st hozhat l\u00e9tre!' }, 403);
  const id = crypto.randomUUID();
  const ev = { id, title, description: description || '', type, start_time, end_time, max_slots: max_slots || 0, created_by: user.id, creator_name: user.username };
  await env.DB.prepare('INSERT INTO events (id, title, description, type, start_time, end_time, max_slots, created_by, creator_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
    .bind(id, title, ev.description, type, start_time, end_time, ev.max_slots, user.id, user.username, Date.now()).run();
  const wh = webhookForType(type);
  const msgId = await sendEmbed(wh.url, buildEmbed(ev, 0));
  if (msgId) await env.DB.prepare('UPDATE events SET discord_message_id=?1, discord_webhook_type=?2 WHERE id=?3').bind(msgId, wh.key, id).run();
  await sendEmbed(WEBHOOK_LOG, { title: '\uD83D\uDCDD Log: \u00FAj esem\u00e9ny', description: `**${user.username}** l\u00e9trehozta: **${title}** (${type})`, color: 0x8fa4bc, timestamp: new Date().toISOString() });
  return jsonRes({ ok: true, id });
}
async function handleUpdateEvent(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user || (!user.isAdmin && !user.isSupervisor)) return jsonRes({ error: 'Nincs jogosults\u00e1god!' }, 403);
  const { event_id, title, description, start_time, end_time, max_slots } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hi\u00e1nyz\u00f3 event_id' }, 400);
  const ev = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!ev) return jsonRes({ error: 'Nem tal\u00e1lhat\u00f3' }, 404);
  if (!user.isAdmin && ev.created_by !== user.id) return jsonRes({ error: 'Csak a saj\u00e1t esem\u00e9nyedet szerkesztheted!' }, 403);
  const newTitle = title ?? ev.title; const newDesc = description ?? ev.description;
  const newStart = start_time ?? ev.start_time; const newEnd = end_time ?? ev.end_time; const newSlots = max_slots ?? ev.max_slots;
  await env.DB.prepare('UPDATE events SET title=?1, description=?2, start_time=?3, end_time=?4, max_slots=?5 WHERE id=?6').bind(newTitle, newDesc, newStart, newEnd, newSlots, event_id).run();
  const updEv = { ...ev, title: newTitle, description: newDesc, start_time: newStart, end_time: newEnd, max_slots: newSlots };
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
  if (ev.discord_message_id) { const wh = webhookForType(ev.type); await editEmbed(wh.id, wh.token, ev.discord_message_id, buildEmbed(updEv, countRow?.c || 0)); }
  await sendEmbed(WEBHOOK_LOG, { title: '\u270F\uFE0F Log: esem\u00e9ny szerkesztve', description: `**${user.username}** szerkesztette: **${newTitle}**`, color: 0x8fa4bc, timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}
async function handleBookSlot(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Bel\u00e9p\u00e9s sz\u00FCks\u00e9ges a jelentkez\u00e9shez!' }, 401);
  const { event_id } = await request.json();
  if (!event_id) return jsonRes({ error: 'Hi\u00e1nyz\u00f3 event_id' }, 400);
  const event = await env.DB.prepare('SELECT * FROM events WHERE id=?1').bind(event_id).first();
  if (!event) return jsonRes({ error: 'Esem\u00e9ny nem tal\u00e1lhat\u00f3' }, 404);
  const existing = await env.DB.prepare('SELECT id FROM bookings WHERE event_id=?1 AND user_id=?2').bind(event_id, user.id).first();
  if (existing) return jsonRes({ error: 'M\u00e1r jelentkezt\u00e9l erre az esem\u00e9nyre!' }, 409);
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE event_id=?1').bind(event_id).first();
  const bookedCount = countRow?.c || 0;
  if (event.max_slots > 0 && bookedCount >= event.max_slots) return jsonRes({ error: 'Nincs t\u00f6bb szabad hely!' }, 400);
  await env.DB.prepare('INSERT INTO bookings (event_id, user_id, email, username, created_at) VALUES (?1,?2,?3,?4,?5)').bind(event_id, user.id, user.email || '', user.username, Date.now()).run();
  const newCount = bookedCount + 1;
  if (event.discord_message_id) { const wh = webhookForType(event.type); await editEmbed(wh.id, wh.token, event.discord_message_id, buildEmbed(event, newCount)); }
  const startStr = new Date(event.start_time).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
  await sendEmbed(WEBHOOK_LOG, { title: '\u2705 Log: \u00FAj jelentkez\u00e9s', description: `**${user.username}** jelentkezett: **${event.title}**`, color: 0x22c55e, fields: [{ name: '\u23F0 Id\u0151pont', value: startStr, inline: true }, { name: '\uD83D\uDCE7 Email', value: user.email || 'nincs', inline: true }], timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}
async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response('Hi\u00e1nyz\u00f3 email', { status: 400, headers: CORS });
  await env.DB.prepare('UPDATE users SET email=NULL WHERE email=?1').bind(email).run();
  return new Response('<html><body style="font-family:Arial;background:#0f1826;color:#dce8f5;display:flex;align-items:center;justify-content:center;height:100vh"><h2>\u2705 Sikeresen leiratkozt\u00e1l az \u00e9rtes\u00edt\u0151kr\u0151l.</h2></body></html>', { headers: { 'Content-Type': 'text/html', ...CORS } });
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
  await env.DB.prepare('INSERT INTO users (id, discord_id, discord_username, email, is_admin, created_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, email=excluded.email, is_admin=excluded.is_admin').bind(dUser.id, dUser.id, dUser.username, dUser.email || null, isAdmin ? 1 : 0, now).run();
  const dbUser = await env.DB.prepare('SELECT is_supervisor, is_worker FROM users WHERE discord_id=?1').bind(dUser.id).first();
  const isSupervisor = dbUser?.is_supervisor === 1;
  const isWorker     = dbUser?.is_worker === 1;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)').bind(dUser.id, 'discord_login', ip, request.headers.get('User-Agent') || '', now).run();
  await sendEmbed(WEBHOOK_LOG, { title: '\uD83D\uDD11 Log: bel\u00e9p\u00e9s', description: `**${dUser.username}** bejelentkezett Discord-dal`, color: 0x5865f2, fields: [{ name: '\uD83D\uDCCD IP', value: ip, inline: true }], timestamp: new Date().toISOString() });
  const payload = { id: dUser.id, discord_id: dUser.id, username: dUser.username, avatar: dUser.avatar, email: dUser.email || null, roblox_username: null, isAdmin, isSupervisor, isWorker, exp: now + 86400000 };
  const token = await signToken(payload, env.JWT_SECRET);
  return Response.redirect(`https://gekox23.github.io/mk-mernokseg/?token=${token}`, 302);
}
async function handleMe(request, env) {
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);
  // isWorker fréssel átfésüljük az adatbázisból (token lejart esetén is naprakész legyen)
  const dbUser = await env.DB.prepare('SELECT is_supervisor, is_worker, is_admin FROM users WHERE id=?1').bind(user.id).first();
  if (dbUser) {
    user.isSupervisor = dbUser.is_supervisor === 1;
    user.isWorker     = dbUser.is_worker === 1;
    user.isAdmin      = dbUser.is_admin === 1;
  }
  return jsonRes(user);
}
async function handleLog(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)').bind(user?.id || 'anonymous', body.action || 'unknown', ip, request.headers.get('User-Agent') || '', Date.now()).run();
  await sendEmbed(WEBHOOK_LOG, { title: '\uD83D\uDCDD Log: aktivit\u00e1s', description: `**${user?.username || 'ismeretlen'}** \u2192 ${body.action || 'unknown'}`, color: 0x8fa4bc, fields: [{ name: 'IP', value: ip, inline: true }], timestamp: new Date().toISOString() });
  return jsonRes({ ok: true });
}
async function handleChatSend(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POST only' }, 405);
  const user = await authUser(request, env);
  if (!user) return jsonRes({ error: 'Bel\u00e9p\u00e9s sz\u00FCks\u00e9ges a chathez!' }, 401);
  const body = await request.json();
  const msg = (body.message || '').trim().slice(0, 500);
  if (!msg) return jsonRes({ error: '\u00DCres \u00FCzenet' }, 400);
  await env.DB.prepare('INSERT INTO chat (user_id, username, avatar, message, created_at) VALUES (?1,?2,?3,?4,?5)').bind(user.id, user.username, user.avatar || null, msg, Date.now()).run();
  await env.DB.prepare('INSERT INTO logs (user_id, action, ip, user_agent, created_at) VALUES (?1,?2,?3,?4,?5)').bind(user.id, 'chat_send', request.headers.get('CF-Connecting-IP') || 'unknown', request.headers.get('User-Agent') || '', Date.now()).run();
  await sendEmbed(WEBHOOK_LOG, { title: '\uD83D\uDCAC Log: chat \u00FCzenet', description: `**${user.username}**: ${msg.slice(0, 200)}`, color: 0x8fa4bc, timestamp: new Date().toISOString() });
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
