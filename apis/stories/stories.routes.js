const express = require("express");

const {
  getEmployeeStories,
  getEmployerStories,
  markEmployeeStoryRead,
  markEmployerStoryRead,
} = require("./stories.controller");

const router = express.Router();


// GET /api/app/stories/employee/:employeeId
router.get("/employee/:employeeId", getEmployeeStories);


// GET /api/app/stories/employer/:employerId
router.get("/employer/:employerId", getEmployerStories);

// POST /api/app/stories/employee/mark-read { employee_id, story_id }
router.post("/employee/mark-read", markEmployeeStoryRead);

// POST /api/app/stories/employer/mark-read { employer_id, story_id }
router.post("/employer/mark-read", markEmployerStoryRead);

module.exports = router;
