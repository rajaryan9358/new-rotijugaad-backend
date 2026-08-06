const express = require('express');
const Notification = require('../models/Notification');
const { sequelize } = require('../config/db');
const { QueryTypes } = require('sequelize');

const Log = require('../models/Log');
const getAdminId = require('../utils/getAdminId');
const { fillBilingualPair } = require('../utils/bilingual');
const { sendMultipleNotification } = require('../utils/pushNotifications');

const safeCreateLog = async (req, payload) => {
  try {
    await Log.create({
      ...payload,
      rj_employee_id: payload?.rj_employee_id ?? getAdminId(req) ?? null,
    });
  } catch (error) {
    console.error('[notifications] audit log failed:', error?.message || error);
  }
};

const router = express.Router();

const baseTokenWhere = `
  u.fcm_token IS NOT NULL
  AND TRIM(u.fcm_token) <> ''
  AND u.is_active = 1
  AND (u.delete_pending IS NULL OR u.delete_pending = 0)
`;

function isHindiLanguage(lang) {
  const l = String(lang || '').trim().toLowerCase();
  return l === 'hi' || l === 'hindi';
}

function normalizeRecipientRows(rows) {
  const out = [];
  const seen = new Set();

  for (const r of rows || []) {
    const token = String(r?.token || '').trim();
    if (!token) continue;

    const lang = String(r?.lang || '').trim();
    const key = `${token}::${lang}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ token, lang });
  }

  return out;
}

function mergePushResults({ en, hi, errors }) {
  const results = [
    en ? { lang: 'en', ...en } : null,
    hi ? { lang: 'hi', ...hi } : null,
  ].filter(Boolean);

  const total = {
    requested: 0,
    successCount: 0,
    failureCount: 0,
    responses: results,
    errors: Array.isArray(errors) ? errors : [],
  };

  for (const r of results) {
    total.requested += Number(r.requested || 0);
    total.successCount += Number(r.successCount || 0);
    total.failureCount += Number(r.failureCount || 0);
  }

  return total;
}

async function fetchTokensForTarget(target) {
  const t = String(target || '').trim().toLowerCase();

  // NOTE: Prefer raw SQL to avoid relying on Sequelize associations.
  // Also: keep queries conservative (filter deleted_at for paranoid tables).
  let sql = null;

  switch (t) {
    case 'all_users':
      sql = `SELECT u.fcm_token AS token, u.preferred_language AS lang FROM users u WHERE ${baseTokenWhere}`;
      break;
    case 'all_employees':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employees e ON e.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employee'
          AND e.deleted_at IS NULL
      `;
      break;
    case 'all_employers':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employers em ON em.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employer'
          AND em.deleted_at IS NULL
      `;
      break;

    case 'employees_with_subscription':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employees e ON e.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employee'
          AND e.deleted_at IS NULL
          AND e.subscription_plan_id IS NOT NULL
          AND e.credit_expiry_at IS NOT NULL
          AND e.credit_expiry_at > NOW()
      `;
      break;
    case 'employees_without_subscription':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employees e ON e.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employee'
          AND e.deleted_at IS NULL
          AND (
            e.subscription_plan_id IS NULL
            OR e.credit_expiry_at IS NULL
            OR e.credit_expiry_at <= NOW()
          )
      `;
      break;

    case 'employers_with_subscription':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employers em ON em.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employer'
          AND em.deleted_at IS NULL
          AND em.subscription_plan_id IS NOT NULL
          AND em.credit_expiry_at IS NOT NULL
          AND em.credit_expiry_at > NOW()
      `;
      break;
    case 'employers_without_subscription':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employers em ON em.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employer'
          AND em.deleted_at IS NULL
          AND (
            em.subscription_plan_id IS NULL
            OR em.credit_expiry_at IS NULL
            OR em.credit_expiry_at <= NOW()
          )
      `;
      break;

    case 'verified_employees':
    case 'pending_employees':
    case 'rejected_employees': {
      const status = t.replace('_employees', '');
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employees e ON e.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employee'
          AND e.deleted_at IS NULL
          AND e.verification_status = :status
      `;
      return sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: { status },
      }).then((rows) => normalizeRecipientRows(rows));
    }

    case 'pending_kyc_employees':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employees e ON e.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employee'
          AND e.deleted_at IS NULL
          AND e.kyc_status = 'pending'
      `;
      break;

    case 'verified_employers':
    case 'pending_employers':
    case 'rejected_employers': {
      const status = t.replace('_employers', '');
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employers em ON em.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employer'
          AND em.deleted_at IS NULL
          AND em.verification_status = :status
      `;
      return sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: { status },
      }).then((rows) => normalizeRecipientRows(rows));
    }

    case 'pending_kyc_employers':
      sql = `
        SELECT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employers em ON em.user_id = u.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employer'
          AND em.deleted_at IS NULL
          AND em.kyc_status = 'pending'
      `;
      break;

    case 'employers_with_active_job':
      sql = `
        SELECT DISTINCT u.fcm_token AS token, u.preferred_language AS lang
        FROM users u
        JOIN employers em ON em.user_id = u.id
        JOIN jobs j ON j.employer_id = em.id
        WHERE ${baseTokenWhere}
          AND u.user_type = 'employer'
          AND em.deleted_at IS NULL
          AND j.deleted_at IS NULL
          AND j.status = 'active'
      `;
      break;

    default:
      return null;
  }

  const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
  return normalizeRecipientRows(rows);
}

router.get('/', async (req, res) => {
  try {
    const rawLimit = Number(req.query?.limit);
    const rawOffset = Number(req.query?.offset);

    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 200;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const { rows, count } = await Notification.findAndCountAll({
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: rows,
      meta: { total: count, limit, offset },
    });
  } catch (err) {
    console.error('[notifications] list error', err);
    res.status(500).json({ success: false, message: 'Unable to fetch notifications' });
  }
});

router.post('/', async (req, res) => {
  try {
    const titlePair = await fillBilingualPair(req.body?.title, req.body?.title_hindi);
    const bodyPair = await fillBilingualPair(req.body?.body, req.body?.body_hindi);
    const target = String(req.body?.target || '').trim().toLowerCase();
    const targetHindiRaw = String(req.body?.target_hindi || '').trim();
    const targetHindi = targetHindiRaw ? targetHindiRaw : null;

    if (!titlePair.english && !titlePair.hindi) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!bodyPair.english && !bodyPair.hindi) {
      return res.status(400).json({ success: false, message: 'Body is required' });
    }
    if (!target) {
      return res.status(400).json({ success: false, message: 'Target is required' });
    }

    // 1) Resolve recipients
    const recipients = await fetchTokensForTarget(target);
    if (recipients === null) {
      return res.status(400).json({
        success: false,
        message: `Unsupported target: ${target}`,
      });
    }
    if (!recipients.length) {
      return res.status(400).json({
        success: false,
        message: 'No recipients found for the selected target',
      });
    }

    const tokensEn = [];
    const tokensHi = [];
    for (const r of recipients) {
      if (isHindiLanguage(r.lang)) tokensHi.push(r.token);
      else tokensEn.push(r.token);
    }
    console.log(`[notifications] target=${target} recipients=${recipients.length} en=${tokensEn.length} hi=${tokensHi.length}`);

    // 2) Send push BEFORE saving to DB
    const pushErrors = [];
    let pushEn = null;
    let pushHi = null;

    const dataPayload = {
      title_en: titlePair.english || '',
      body_en: bodyPair.english || '',
      title_hi: titlePair.hindi || '',
      body_hi: bodyPair.hindi || '',
      // Backward-compat keys for older app builds
      title_hindi: titlePair.hindi || '',
      body_hindi: bodyPair.hindi || '',
      target,
    };

    if (tokensEn.length) {
      try {
        pushEn = await sendMultipleNotification({
          title: titlePair.english || titlePair.hindi,
          message: bodyPair.english || bodyPair.hindi,
          tokens: tokensEn,
          data: dataPayload,
        });
      } catch (error) {
        console.error('[notifications] fcm send error (en)', error);
        pushErrors.push({ lang: 'en', error: String(error?.message || error) });
        pushEn = {
          requested: tokensEn.length,
          successCount: 0,
          failureCount: tokensEn.length,
          responses: [],
        };
      }
    }

    if (tokensHi.length) {
      try {
        pushHi = await sendMultipleNotification({
          title: titlePair.hindi || titlePair.english,
          message: bodyPair.hindi || bodyPair.english,
          tokens: tokensHi,
          data: dataPayload,
        });
      } catch (error) {
        console.error('[notifications] fcm send error (hi)', error);
        pushErrors.push({ lang: 'hi', error: String(error?.message || error) });
        pushHi = {
          requested: tokensHi.length,
          successCount: 0,
          failureCount: tokensHi.length,
          responses: [],
        };
      }
    }

    const push = mergePushResults({ en: pushEn, hi: pushHi, errors: pushErrors });
    const now = new Date();
    const allOk = (push.failureCount || 0) === 0;
    const anyOk = (push.successCount || 0) > 0;

    // 3) Save after sending
    const notification = await Notification.create({
      title: titlePair.english || titlePair.hindi,
      title_hindi: titlePair.hindi,
      body: bodyPair.english || bodyPair.hindi,
      body_hindi: bodyPair.hindi,
      target,
      target_hindi: targetHindi,
      status: allOk ? 'sent' : anyOk ? 'partial' : 'failed',
      sent_at: anyOk ? now : null,
    });

    await safeCreateLog(req, {
      category: 'notification',
      type: 'add',
      redirect_to: '/notifications',
      log_text: `Sent notification: ${notification.title || '-'} (Target: ${notification.target || '-'}) (ID: ${notification.id})`,
    });

    res.status(201).json({ success: true, data: notification, push });
  } catch (err) {
    console.error('[notifications] create error', err);
    res.status(500).json({ success: false, message: 'Unable to create notification' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notification.destroy();

    await safeCreateLog(req, {
      category: 'notification',
      type: 'delete',
      redirect_to: '/notifications',
      log_text: `Deleted notification: ${notification.title || '-'} (Target: ${notification.target || '-'}) (ID: ${notification.id})`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[notifications] delete error', err);
    res.status(500).json({ success: false, message: 'Unable to delete notification' });
  }
});

module.exports = router;
