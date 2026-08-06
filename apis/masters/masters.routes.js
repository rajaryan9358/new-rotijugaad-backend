const express = require('express');
const { getAllMasters, getCitiesByState } = require('./masters.controller');

const router = express.Router();

// GET /api/app/masters
router.get("/", getAllMasters);

// GET /api/app/masters/states/:stateId/cities
router.get("/states/:stateId/cities", getCitiesByState);

module.exports = router;
