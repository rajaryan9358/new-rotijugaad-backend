const express = require('express');

const { getRecommendedJobs, sendInterviewerContactOtpForJob, verifyInterviewerContactOtpForJob } = require('./jobs.controller');
const { getAllJobs } = require('./jobs.all.controller');
const { getJobDetail, toggleJobWishlist, getJobIdBySlug } = require('./jobs.detail.controller');

// Employer job actions are implemented in employers.controller, but routed here per module ownership.
const {
  saveEmployerJob,
  getEmployerJobDetail,
  getEmployerReceivedApplicants,
  getEmployerSentApplicants,
  getEmployerShortlistedApplicants,
  getEmployerHiredApplicants,
  getEmployerRejectedApplicants,
} = require('../employers/employers.controller');

const router = express.Router();

// GET /api/app/jobs
router.get('/', getAllJobs);

// POST /api/app/jobs (same as GET, but accepts JSON body params)
router.post('/', getAllJobs);

// Employer job create/update + job detail
// POST /api/app/jobs/employer/:employerId/save
router.post('/employer/:employerId/save', saveEmployerJob);

// GET /api/app/jobs/employer/:employerId/:jobId/detail
router.get('/employer/:employerId/:jobId/detail', getEmployerJobDetail);

// Job-scoped applicants (status)
router.get('/employer/:employerId/:jobId/applicants/received', getEmployerReceivedApplicants);
router.get('/employer/:employerId/:jobId/applicants/sent', getEmployerSentApplicants);
router.get('/employer/:employerId/:jobId/applicants/shortlisted', getEmployerShortlistedApplicants);
router.get('/employer/:employerId/:jobId/applicants/hired', getEmployerHiredApplicants);
router.get('/employer/:employerId/:jobId/applicants/rejected', getEmployerRejectedApplicants);

// Interviewer OTP (employer flow)
router.post('/interviewer-contact/send-otp/:employerId', sendInterviewerContactOtpForJob);
router.post('/interviewer-contact/verify-otp/:employerId', verifyInterviewerContactOtpForJob);

// Employee job detail
router.get('/detail/:jobId/:employeeId', getJobDetail);

// Resolve job by slug (deeplink support)
router.get('/slug/:slug', getJobIdBySlug);

// Employee job wishlist toggle
router.post('/wishlist/toggle', toggleJobWishlist);

// Recommended jobs (employee)
router.get('/recommended/:employeeId', getRecommendedJobs);
// POST /api/app/jobs/recommended/:employeeId (accepts JSON body params)
router.post('/recommended/:employeeId', getRecommendedJobs);

module.exports = router;
