const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const models = require('../models');

const Job = models.Job;
const { notifyJobExpiryBatch } = require('../utils/systemNotifications');

const CRON_SECRET = process.env.CRON_SECRET || '';

function requireCronSecret(req, res, next) {
  const secret = (req.headers['x-cron-secret'] || '').trim();
  if (!CRON_SECRET) {
    return res.status(500).json({ success: false, message: 'CRON_SECRET not configured on server' });
  }
  if (!secret || secret !== CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  return next();
}

function dateOnly(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * POST /api/cron/job-expiry-notifications
 *
 * Checks jobs by expired_at date (date-only comparison):
 *   - expired_at = tomorrow  → notify "expiring in 1 day"
 *   - expired_at = today     → notify "expiring today" + mark status=expired
 *   - expired_at = yesterday → notify "job expired"   + mark status=expired (safety net)
 *
 * Protected by x-cron-secret header (set CRON_SECRET in .env).
 */
router.post('/job-expiry-notifications', requireCronSecret, async (req, res) => {
  try {
    const now = new Date();

    const todayStart = dateOnly(now);
    const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowEnd   = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd   = new Date(todayStart.getTime() - 1);

    // Jobs expiring tomorrow (warning — only active, approved jobs worth warning about)
    const expiringTomorrow = await Job.findAll({
      where: {
        expired_at: { [Op.between]: [tomorrowStart, tomorrowEnd] },
        status: 'active',
        verification_status: 'approved',
      },
      attributes: ['id', 'employer_id', 'job_profile_id', 'status'],
      paranoid: true,
    });

    // Jobs expiring today (send "today" notification + mark expired)
    const expiringToday = await Job.findAll({
      where: {
        expired_at: { [Op.between]: [todayStart, todayEnd] },
        status: 'active',
      },
      attributes: ['id', 'employer_id', 'job_profile_id', 'status'],
      paranoid: true,
    });

    // Jobs that expired yesterday and are still active (safety net for missed cron)
    const expiredYesterday = await Job.findAll({
      where: {
        expired_at: { [Op.between]: [yesterdayStart, yesterdayEnd] },
        status: 'active',
      },
      attributes: ['id', 'employer_id', 'job_profile_id', 'status'],
      paranoid: true,
    });

    // Mark today's and yesterday's active jobs as expired
    const toExpireIds = [
      ...expiringToday.map(j => j.id),
      ...expiredYesterday.map(j => j.id),
    ];
    if (toExpireIds.length) {
      await Job.update(
        { status: 'expired' },
        { where: { id: { [Op.in]: toExpireIds } } }
      );
    }

    // Send notifications (fire in parallel per batch)
    const [warningResults, todayResults, expiredResults] = await Promise.all([
      notifyJobExpiryBatch({ jobs: expiringTomorrow, templateKey: 'job.expiry.warning' }),
      notifyJobExpiryBatch({ jobs: expiringToday,    templateKey: 'job.expiry.today' }),
      notifyJobExpiryBatch({ jobs: expiredYesterday, templateKey: 'job.status.expired' }),
    ]);

    const summary = {
      run_at: now.toISOString(),
      expiring_tomorrow: {
        count: expiringTomorrow.length,
        notified: warningResults.filter(r => r.sent).length,
      },
      expiring_today: {
        count: expiringToday.length,
        notified: todayResults.filter(r => r.sent).length,
        marked_expired: expiringToday.length,
      },
      expired_yesterday: {
        count: expiredYesterday.length,
        notified: expiredResults.filter(r => r.sent).length,
        marked_expired: expiredYesterday.length,
      },
    };

    console.log('[cron] job-expiry-notifications completed', summary);
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[cron] job-expiry-notifications error', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

module.exports = router;
