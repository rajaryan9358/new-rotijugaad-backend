const express = require('express');
const {
  getEmployeeById,

  savePersonalInfo,
  getPersonalInfo,

  saveDob,

  saveEmployeeJobProfiles,
  getEmployeeJobProfiles,

  saveEmployeeExperience,
  getEmployeeExperienceById,
  getEmployeeExperiencesByEmployeeId,
  deleteEmployeeExperience,

  saveEmployeeDocument,
  getEmployeeDocumentsByEmployeeId,
  getEmployeeDocumentById,
  deleteEmployeeDocument,
  submitEmployeeProfileForReview,

  sendAadharOtp,
  verifyAadharOtp,
  uploadSelfie,
} = require('./employees.controller');

const {
  unlockJobContact,
  saveContactCallExperience,
  sendJobInterest,
  unlockApplicationOtp,
  reportJob,
  toggleJobWishlist,
  getEmployeeWishlist,
  getEmployeeApplicationsSent,
  getEmployeeApplicationsReceived,
  getEmployeeInterestHistory,
  getEmployeeHiredJobs,
  getEmployeePaymentHistory,
  getEmployeeSubscriptions,
  getEmployeeContactHistory,
  buySubscription,
  getSubscriptionPaymentStatusByOrderId,
} = require('../jobs/jobs.detail.controller');

const { createUploader } = require('../_helpers/upload');

const router = express.Router();

// Base detail
// GET /api/app/employees/:id
router.get('/:id', getEmployeeById);

// Personal info
// POST /api/app/employees/:employeeId/personal-info
router.post('/:id/personal-info', savePersonalInfo);
// GET /api/app/employees/:employeeId/personal-info
router.get('/:id/personal-info', getPersonalInfo);

// POST /api/app/employees/:employeeId/dob
router.post('/:employeeId/dob', saveDob);

// Job profiles
// POST /api/app/employees/:employeeId/job-profiles
router.post('/:employeeId/job-profiles', saveEmployeeJobProfiles);
// GET /api/app/employees/:employeeId/job-profiles
router.get('/:employeeId/job-profiles', getEmployeeJobProfiles);

// Experiences (with optional certificate upload)
const expUpload = createUploader('app/employees/experience-certificates');
// POST /api/app/employees/:employeeId/experiences
router.post('/:employeeId/experiences', expUpload.fields([{ name: 'certificate', maxCount: 1 }, { name: 'experience_certificate', maxCount: 1 }, { name: 'file', maxCount: 1 }]), saveEmployeeExperience);
// GET /api/app/employees/:employeeId/experiences
router.get('/:employeeId/experiences', getEmployeeExperiencesByEmployeeId);
// GET /api/app/employees/experiences/:experienceId
router.get('/experiences/:experienceId', getEmployeeExperienceById);
// PUT /api/app/employees/experiences/:experienceId
router.put('/experiences/:experienceId', expUpload.fields([{ name: 'certificate', maxCount: 1 }, { name: 'experience_certificate', maxCount: 1 }, { name: 'file', maxCount: 1 }]), saveEmployeeExperience);
// DELETE /api/app/employees/experiences/:experienceId
router.delete('/experiences/:experienceId', deleteEmployeeExperience);

// Documents (required file on create; optional file on update)
const docUpload = createUploader('app/employees/documents');
// POST /api/app/employees/:employeeId/documents
router.post('/:employeeId/documents', docUpload.fields([{ name: 'document', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'document_file', maxCount: 1 }]), saveEmployeeDocument);
// GET /api/app/employees/:employeeId/documents
router.get('/:employeeId/documents', getEmployeeDocumentsByEmployeeId);
// GET /api/app/employees/documents/:documentId
router.get('/documents/:documentId', getEmployeeDocumentById);
// PUT /api/app/employees/documents/:documentId
router.put('/documents/:documentId', docUpload.fields([{ name: 'document', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'document_file', maxCount: 1 }]), saveEmployeeDocument);
// DELETE /api/app/employees/documents/:documentId
router.delete('/documents/:documentId', deleteEmployeeDocument);

// Submit employee profile for review after documents step
// POST /api/app/employees/:employeeId/submit-for-review
router.post('/:employeeId/submit-for-review', submitEmployeeProfileForReview);

// Aadhaar OTP
// POST /api/app/employees/:employeeId/aadhar/send-otp
router.post('/:employeeId/aadhar/send-otp', sendAadharOtp);
// POST /api/app/employees/:employeeId/aadhar/verify-otp
router.post('/:employeeId/aadhar/verify-otp', verifyAadharOtp);

// Selfie upload
const selfieUpload = createUploader('app/employees/selfies');
// POST /api/app/employees/:employeeId/selfie
router.post('/:employeeId/selfie', selfieUpload.fields([{ name: 'selfie', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'document', maxCount: 1 }, { name: 'image', maxCount: 1 }]), uploadSelfie);

// Employee job actions (moved from jobs module)
// GET /api/app/employees/:employeeId/contacts/history
router.get('/:employeeId/contacts/history', getEmployeeContactHistory);
// GET /api/app/employees/:employeeId/interests/history
router.get('/:employeeId/interests/history', getEmployeeInterestHistory);
// GET /api/app/employees/:employeeId/hired
router.get('/:employeeId/hired', getEmployeeHiredJobs);
// GET /api/app/employees/:employeeId/payments/history
router.get('/:employeeId/payments/history', getEmployeePaymentHistory);
// GET /api/app/employees/:employeeId/subscriptions
router.get('/:employeeId/subscriptions', getEmployeeSubscriptions);
// POST /api/app/employees/:employeeId/subscriptions/buy
router.post('/:employeeId/subscriptions/buy', buySubscription);
// GET /api/app/employees/:employeeId/subscriptions/status/:orderId
router.get(
  '/:employeeId/subscriptions/status/:orderId',
  getSubscriptionPaymentStatusByOrderId,
);
// GET /api/app/employees/:employeeId/wishlist
router.get('/:employeeId/wishlist', getEmployeeWishlist);

// POST /api/app/employees/jobs/unlock-contact
router.post('/jobs/unlock-contact', unlockJobContact);
// POST /api/app/employees/jobs/unlock-application-otp
router.post('/jobs/unlock-application-otp', unlockApplicationOtp);
// POST /api/app/employees/jobs/call-experience
router.post('/jobs/call-experience', saveContactCallExperience);
// POST /api/app/employees/jobs/interest
router.post('/jobs/interest', sendJobInterest);
// POST /api/app/employees/jobs/report
router.post('/jobs/report', reportJob);
// POST /api/app/employees/jobs/wishlist/toggle
router.post('/jobs/wishlist/toggle', toggleJobWishlist);

// GET /api/app/employees/:employeeId/applications/sent
router.get('/:employeeId/applications/sent', getEmployeeApplicationsSent);
// GET /api/app/employees/:employeeId/applications/received
router.get('/:employeeId/applications/received', getEmployeeApplicationsReceived);

// Multer/upload error handler (avoid default HTML error pages)
router.use((err, req, res, next) => {
  if (err == null) return next();
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ ok: false, code: 'FC_99', message: err.message, data: null });
  }
  return res.status(400).json({ ok: false, code: 'FC_99', message: err.message || 'Upload failed', data: null });
});

module.exports = router;
