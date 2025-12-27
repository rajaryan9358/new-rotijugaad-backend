const express = require('express');
const Notification = require('../models/Notification');

const Log = require('../models/Log');
const getAdminId = require('../utils/getAdminId');

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

router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      order: [['created_at', 'DESC']],
    });
    res.json({ success: true, data: notifications });
  } catch (err) {
    console.error('[notifications] list error', err);
    res.status(500).json({ success: false, message: 'Unable to fetch notifications' });
  }
});

router.post('/', async (req, res) => {
  const { title, body, target } = req.body;
  if (!title || !body || !target) {
    return res.status(400).json({ success: false, message: 'Title, body and target are required' });
  }
  try {
    const notification = await Notification.create({ title, body, target });

    await safeCreateLog(req, {
      category: 'notification',
      type: 'add',
      redirect_to: '/notifications',
      log_text: `Sent notification: ${notification.title || '-'} (Target: ${notification.target || '-'}) (ID: ${notification.id})`,
    });

    res.status(201).json({ success: true, data: notification });
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
