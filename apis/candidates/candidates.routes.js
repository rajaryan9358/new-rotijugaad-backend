const express = require('express');

const {
  getRecommendedCandidates,
  getCandidateDetail,
  getCandidateIdBySlug,
  unlockCandidateContact,
  reportCandidate,
} = require('./candidates.controller');

const { getAllCandidates } = require('./candidates.all.controller');

const router = express.Router();

// GET /api/app/candidates
router.get('/', getAllCandidates);

// POST /api/app/candidates (accepts JSON body params)
router.post('/', getAllCandidates);

// GET /api/app/candidates/recommended/:employerId
router.get('/recommended/:employerId', getRecommendedCandidates);

// POST /api/app/candidates/recommended/:employerId (accepts JSON body params)
router.post('/recommended/:employerId', getRecommendedCandidates);

// GET /api/app/candidates/detail/:candidateId/:employerId
router.get('/detail/:candidateId/:employerId', getCandidateDetail);

// Resolve candidate by slug (deeplink support)
router.get('/slug/:slug', getCandidateIdBySlug);

// POST /api/app/candidates/unlock-contact
router.post('/unlock-contact', unlockCandidateContact);

// POST /api/app/candidates/report
router.post('/report', reportCandidate);

module.exports = router;
