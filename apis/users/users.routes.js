const express = require('express');
const {
	getUserById,
	getUserNotifications,
	markUserNotificationsRead,
	updatePreferredLanguage,
	updateLastActiveAt,
	submitDeletionRequest,
	createUserReview,
	updateFcmToken,
} = require('./users.controller');

const router = express.Router();

// GET /api/app/users/:id
router.get('/:id', getUserById);

// GET /api/app/users/:id/notifications
router.get('/:id/notifications', getUserNotifications);

// PUT /api/app/users/:id/notifications/read
router.put('/:id/notifications/read', markUserNotificationsRead);

// PUT /api/app/users/:id/preferred-language
router.put('/:id/preferred-language', updatePreferredLanguage);

// PUT /api/app/users/:id/last-active
router.put('/:id/last-active', updateLastActiveAt);

// POST /api/app/users/:id/delete-request
router.post('/:id/delete-request', submitDeletionRequest);

// PUT /api/app/users/:id/fcm-token
router.put('/:id/fcm-token', updateFcmToken);

// Reviews
// POST /api/app/users/:id/reviews
router.post('/:id/reviews', createUserReview);

module.exports = router;
