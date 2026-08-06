const express = require('express');

const router = express.Router();

// Module-based APIs for mobile app
router.use('/auth', require('./auth/auth.routes'));
router.use('/masters', require('./masters/masters.routes'));
router.use('/users', require('./users/users.routes'));
router.use('/employees', require('./employees/employees.routes'));
router.use('/employers', require('./employers/employers.routes'));
router.use('/payments', require('./payments/payments.routes'));
router.use('/jobs', require('./jobs/jobs.routes'));
router.use('/candidates', require('./candidates/candidates.routes'));
router.use('/stories', require('./stories/stories.routes'));
router.use('/settings', require('./settings/settings.routes'));

module.exports = router;
