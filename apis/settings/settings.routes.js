const express = require('express');
const { getAppSettings } = require('./settings.controller');

const router = express.Router();

// GET /api/app/settings
router.get('/', getAppSettings);

module.exports = router;
