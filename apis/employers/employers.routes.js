const express = require("express");
const { createUploader } = require("../_helpers/upload");

const {
  getEmployerById,
  saveEmployerPersonalInfo,
  sendEmployerAadharOtp,
  verifyEmployerAadharOtp,
  uploadEmployerDocument,
  getEmployerApplicants,
  getEmployerReceivedApplicants,
  getEmployerSentApplicants,
  getEmployerShortlistedApplicants,
  getEmployerHiredApplicants,
  getEmployerRejectedApplicants,
  updateEmployerApplicantStatus,
  getEmployerJobs,
  getEmployerContactHistory,
  getEmployerInterestHistory,
  getEmployerAdsHistory,
  getEmployerSubscriptions,
  getEmployerPaymentHistory,
  buySubscription,
  getSubscriptionPaymentStatusByOrderId,
} = require("./employers.controller");

// Employer -> candidate actions are implemented in candidates.controller, but routed here per module ownership.
const {
  getEmployerActiveJobsForShortlisting,
  getEmployerJobsForSendingInterest,
  getEmployerShortlistedCandidates,
  shortlistCandidateForJobs,
  toggleEmployerCandidateShortlist,
  sendInterestToCandidateForJobs,
  saveEmployerContactCallExperience,
} = require("../candidates/candidates.controller");

const router = express.Router();

// Employer -> candidate actions
// GET /api/app/employers/candidates/jobs/shortlist/:employerId/:candidateId
router.get("/candidates/jobs/shortlist/:employerId/:candidateId", getEmployerActiveJobsForShortlisting);

// GET /api/app/employers/candidates/jobs/send-interest/:employerId/:candidateId
router.get("/candidates/jobs/send-interest/:employerId/:candidateId", getEmployerJobsForSendingInterest);

// POST /api/app/employers/candidates/jobs/shortlist
router.post("/candidates/jobs/shortlist", shortlistCandidateForJobs);

// POST /api/app/employers/candidates/shortlist/toggle
router.post("/candidates/shortlist/toggle", toggleEmployerCandidateShortlist);

// POST /api/app/employers/candidates/jobs/send-interest
router.post("/candidates/jobs/send-interest", sendInterestToCandidateForJobs);

// POST /api/app/employers/candidates/call-experience
router.post("/candidates/call-experience", saveEmployerContactCallExperience);

// GET /api/app/employers/:employerId/applicants
router.get("/:employerId/applicants", getEmployerApplicants);

// GET /api/app/employers/:employerId/applicants/received
router.get("/:employerId/applicants/received", getEmployerReceivedApplicants);

// GET /api/app/employers/:employerId/applicants/sent
router.get("/:employerId/applicants/sent", getEmployerSentApplicants);

// GET /api/app/employers/:employerId/applicants/shortlisted
router.get("/:employerId/applicants/shortlisted", getEmployerShortlistedApplicants);

// GET /api/app/employers/:employerId/shortlisted-candidates
router.get("/:employerId/shortlisted-candidates", getEmployerShortlistedCandidates);

// GET /api/app/employers/:employerId/applicants/hired
router.get("/:employerId/applicants/hired", getEmployerHiredApplicants);

// GET /api/app/employers/:employerId/applicants/rejected
router.get("/:employerId/applicants/rejected", getEmployerRejectedApplicants);

// POST /api/app/employers/:employerId/applicants/status
router.post("/:employerId/applicants/status", updateEmployerApplicantStatus);

// GET /api/app/employers/:employerId/jobs
router.get("/:employerId/jobs", getEmployerJobs);

// History
router.get("/:employerId/history/contacts", getEmployerContactHistory);
router.get("/:employerId/history/interests", getEmployerInterestHistory);
router.get("/:employerId/history/ads", getEmployerAdsHistory);

// Payments & subscriptions
router.get("/payments/history/:employerId", getEmployerPaymentHistory);
router.get("/:employerId/subscriptions", getEmployerSubscriptions);
router.post('/:employerId/subscriptions/buy', buySubscription);
router.get(
  '/:employerId/subscriptions/status/:orderId',
  getSubscriptionPaymentStatusByOrderId,
);

// Profile
router.get("/:employerId/profile", getEmployerById);
router.get("/:id", getEmployerById);

// Personal info
router.put("/:id/personal-info", saveEmployerPersonalInfo);

// Aadhaar OTP
router.post("/:employerId/aadhar/send-otp", sendEmployerAadharOtp);
router.post("/:employerId/aadhar/verify-otp", verifyEmployerAadharOtp);

// Document upload
const docUpload = createUploader("app/employers/documents");
router.post(
  "/:employerId/document",
  docUpload.fields([
    { name: "document", maxCount: 1 },
    { name: "file", maxCount: 1 },
    { name: "document_file", maxCount: 1 },
  ]),
  uploadEmployerDocument
);

// Multer/upload error handler (avoid default HTML error pages)
router.use((err, req, res, next) => {
  if (err == null) return next();
  if (err && err.name === "MulterError") {
    return res.status(400).json({ ok: false, code: "FC_99", message: err.message, data: null });
  }
  return res.status(400).json({ ok: false, code: "FC_99", message: err.message || "Upload failed", data: null });
});

module.exports = router;
