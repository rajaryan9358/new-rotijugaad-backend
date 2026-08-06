const UserNotification = require('../models/UserNotification');
const { sendMultipleNotification } = require('./pushNotifications');

function normalizeLanguage(lang) {
  const value = String(lang || '').trim().toLowerCase();
  return value === 'hi' || value === 'hindi' ? 'hi' : 'en';
}

function pickLocalized({ en, hi, lang }) {
  const selected = normalizeLanguage(lang);
  if (selected === 'hi') return String(hi || '').trim() || String(en || '').trim();
  return String(en || '').trim() || String(hi || '').trim();
}

function resolveText(value, user) {
  if (typeof value === 'function') {
    return String(value(user) || '').trim();
  }
  return String(value || '').trim();
}

function normalizeUser(user) {
  if (!user) return null;
  const plain = typeof user.toJSON === 'function' ? user.toJSON() : user;
  const id = Number(plain.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (plain.is_active === false) return null;
  if (plain.delete_pending === true) return null;

  return {
    id,
    user_type: plain.user_type ? String(plain.user_type).trim().toLowerCase() : null,
    preferred_language: plain.preferred_language || null,
    fcm_token: plain.fcm_token || null,
    name: plain.name || null,
    name_hindi: plain.name_hindi || null,
    display_name: plain.display_name || null,
    display_name_hindi: plain.display_name_hindi || null,
  };
}

function dedupeUsers(users) {
  const list = Array.isArray(users) ? users : [];
  const out = [];
  const seen = new Set();

  for (const entry of list) {
    const user = normalizeUser(entry);
    if (!user) continue;
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    out.push(user);
  }

  return out;
}

function buildPayloadData({ row, extraData, storedNotification }) {
  return {
    stored_notification: storedNotification ? 'true' : 'false',
    title_en: row.title_english,
    body_en: row.body_english,
    title_hi: row.title_hindi || '',
    body_hi: row.body_hindi || '',
    title_hindi: row.title_hindi || '',
    body_hindi: row.body_hindi || '',
    reference_type: row.reference_type || '',
    reference_id: row.reference_id == null ? '' : String(row.reference_id),
    ...(extraData || {}),
  };
}

function groupPushMessages(
  createdRows,
  users,
  extraData,
  { storedNotification = true, unreadCountsByUser = new Map() } = {},
) {
  const groups = new Map();

  createdRows.forEach((created, index) => {
    const row = typeof created.toJSON === 'function' ? created.toJSON() : created;
    const user = users[index];
    const token = String(user?.fcm_token || '').trim();
    if (!token) return;

    const title = pickLocalized({
      en: row.title_english,
      hi: row.title_hindi,
      lang: user.preferred_language,
    });
    const message = pickLocalized({
      en: row.body_english,
      hi: row.body_hindi,
      lang: user.preferred_language,
    });
    if (!title || !message) return;

    const data = buildPayloadData({
      row: {
        ...row,
        unread_count: unreadCountsByUser.get(user.id) ?? null,
      },
      extraData: {
        ...(extraData || {}),
        unread_count: unreadCountsByUser.get(user.id) ?? '',
      },
      storedNotification,
    });
    const key = JSON.stringify({ title, message, data });
    if (!groups.has(key)) {
      groups.set(key, { title, message, data, tokens: [] });
    }
    groups.get(key).tokens.push(token);
  });

  return Array.from(groups.values());
}

async function dispatchGroupedPush(groups) {
  if (!groups.length) return [];

  return Promise.all(groups.map(async (group) => {
    try {
      return await sendMultipleNotification({
        title: group.title,
        message: group.message,
        tokens: group.tokens,
        data: group.data,
      });
    } catch (error) {
      console.error('[userNotifications] push send failed', {
        requested: group.tokens.length,
        error: String(error?.message || error),
      });
      return {
        requested: group.tokens.length,
        successCount: 0,
        failureCount: group.tokens.length,
        error: String(error?.message || error),
      };
    }
  }));
}

async function notifyUsers({
  users,
  titleEnglish,
  titleHindi,
  bodyEnglish,
  bodyHindi,
  referenceType,
  referenceId,
  extraData,
  persist = true,
  awaitPush = false,
}) {
  const normalizedUsers = dedupeUsers(users);
  if (!normalizedUsers.length) {
    return { createdCount: 0, pushRequested: 0, pushResults: [] };
  }

  const prepared = normalizedUsers.map((user) => ({
    user,
    row: {
      user_id: user.id,
      user_type: user.user_type || null,
      title_english: resolveText(titleEnglish, user),
      title_hindi: resolveText(titleHindi, user) || null,
      body_english: resolveText(bodyEnglish, user),
      body_hindi: resolveText(bodyHindi, user) || null,
      reference_type: referenceType ? String(referenceType).trim() : null,
      reference_id: Number.isInteger(Number(referenceId)) ? Number(referenceId) : null,
    },
  })).filter(({ row }) => row.title_english && row.body_english);

  const rows = prepared.map(({ row }) => row);
  const targetUsers = prepared.map(({ user }) => user);

  if (!rows.length) {
    return { createdCount: 0, pushRequested: 0, pushResults: [] };
  }

  const createdRows = persist ? await UserNotification.bulkCreate(rows) : rows;
  const unreadCountsByUser = new Map();
  const counts = await Promise.all(targetUsers.map(async (user) => {
    const unreadCount = await UserNotification.count({
      where: {
        user_id: user.id,
        is_read: false,
      },
    });
    return [user.id, unreadCount];
  }));

  counts.forEach(([userId, unreadCount]) => {
    unreadCountsByUser.set(userId, unreadCount);
  });

  const pushGroups = groupPushMessages(createdRows, targetUsers, extraData, {
    storedNotification: persist,
    unreadCountsByUser,
  });
  const pushRequested = pushGroups.reduce((sum, group) => sum + group.tokens.length, 0);

  const pushPromise = dispatchGroupedPush(pushGroups);
  if (!awaitPush) {
    pushPromise.catch(() => []);
  }

  return {
    createdCount: persist ? createdRows.length : 0,
    pushRequested,
    pushResults: awaitPush ? await pushPromise : [],
  };
}

async function notifyUser(options) {
  return notifyUsers({
    ...options,
    users: options?.user ? [options.user] : options?.users,
  });
}

module.exports = {
  notifyUser,
  notifyUsers,
  pickLocalized,
  normalizeLanguage,
};
