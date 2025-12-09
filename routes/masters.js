const express = require('express');
const router = express.Router();
const State = require('../models/State');
const City = require('../models/City');
const Skill = require('../models/Skill');
const Qualification = require('../models/Qualification');
const Shift = require('../models/Shift');
const JobProfile = require('../models/JobProfile');
const DocumentType = require('../models/DocumentType');
const WorkNature = require('../models/WorkNature');
const SalaryRange = require('../models/SalaryRange');
const BusinessCategory = require('../models/BusinessCategory');
const Experience = require('../models/Experience');
const SalaryType = require('../models/SalaryType');
const Distance = require('../models/Distance');
const EmployeeCallExperience = require('../models/EmployeeCallExperience');
const EmployeeReportReason = require('../models/EmployeeReportReason');
const VacancyNumber = require('../models/VacancyNumber');
const JobBenefit = require('../models/JobBenefit');
const EmployerCallExperience = require('../models/EmployerCallExperience');
const EmployerReportReason = require('../models/EmployerReportReason');

/**
 * GET /states
 * List all states ordered by sequence.
 */
router.get('/states', async (req, res) => {
  try {
    const states = await State.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: states });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /states/:id
 * Retrieve a single state by id.
 */
router.get('/states/:id', async (req, res) => {
  try {
    const state = await State.findByPk(req.params.id);
    if (!state) return res.status(404).json({ success: false, message: 'State not found' });
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /states
 * Create a new state.
 */
router.post('/states', async (req, res) => {
  try {
    const { state_english, state_hindi, sequence, is_active } = req.body;
    if (!state_english || !state_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const state = await State.create({ state_english, state_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /states/:id
 * Update an existing state.
 */
router.put('/states/:id', async (req, res) => {
  try {
    const state = await State.findByPk(req.params.id);
    if (!state) return res.status(404).json({ success: false, message: 'State not found' });
    const { state_english, state_hindi, sequence, is_active } = req.body;
    await state.update({ state_english: state_english || state.state_english, state_hindi: state_hindi || state.state_hindi, sequence: sequence !== undefined ? sequence : state.sequence, is_active: is_active !== undefined ? is_active : state.is_active });
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /states/:id
 * Permanently delete a state.
 */
router.delete('/states/:id', async (req, res) => {
  try {
    const state = await State.findByPk(req.params.id);
    if (!state) return res.status(404).json({ success: false, message: 'State not found' });
    await state.destroy();
    res.json({ success: true, message: 'State deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /states/bulk/sequence
 * Update sequence values for multiple states.
 */
router.put('/states/bulk/sequence', async (req, res) => {
  try {
    const { states } = req.body;
    if (!Array.isArray(states)) return res.status(400).json({ success: false, message: 'States array required' });
    await Promise.all(states.map((state) => State.update({ sequence: state.sequence }, { where: { id: state.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /cities
 * List all cities ordered by sequence.
 */
router.get('/cities', async (req, res) => {
  try {
    const cities = await City.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: cities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /cities/:id
 * Retrieve a single city by id.
 */
router.get('/cities/:id', async (req, res) => {
  try {
    const city = await City.findByPk(req.params.id);
    if (!city) return res.status(404).json({ success: false, message: 'City not found' });
    res.json({ success: true, data: city });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /cities
 * Create a new city.
 */
router.post('/cities', async (req, res) => {
  try {
    const { state_id, city_english, city_hindi, sequence, is_active } = req.body;
    if (!state_id || !city_english || !city_hindi) {
      return res.status(400).json({ success: false, message: 'State ID, English and Hindi names are required' });
    }
    const city = await City.create({ state_id, city_english, city_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: city });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /cities/:id
 * Update an existing city.
 */
router.put('/cities/:id', async (req, res) => {
  try {
    const city = await City.findByPk(req.params.id);
    if (!city) return res.status(404).json({ success: false, message: 'City not found' });
    const { state_id, city_english, city_hindi, sequence, is_active } = req.body;
    await city.update({ state_id: state_id || city.state_id, city_english: city_english || city.city_english, city_hindi: city_hindi || city.city_hindi, sequence: sequence !== undefined ? sequence : city.sequence, is_active: is_active !== undefined ? is_active : city.is_active });
    res.json({ success: true, data: city });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /cities/:id
 * Permanently delete a city.
 */
router.delete('/cities/:id', async (req, res) => {
  try {
    const city = await City.findByPk(req.params.id);
    if (!city) return res.status(404).json({ success: false, message: 'City not found' });
    await city.destroy();
    res.json({ success: true, message: 'City deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /cities/bulk/sequence
 * Update sequence values for multiple cities.
 */
router.put('/cities/bulk/sequence', async (req, res) => {
  try {
    const { cities } = req.body;
    if (!Array.isArray(cities)) return res.status(400).json({ success: false, message: 'Cities array required' });
    await Promise.all(cities.map((city) => City.update({ sequence: city.sequence }, { where: { id: city.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /skills
 * List all skills ordered by sequence.
 */
router.get('/skills', async (req, res) => {
  try {
    const skills = await Skill.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: skills });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /skills/:id
 * Retrieve a single skill by id.
 */
router.get('/skills/:id', async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found' });
    res.json({ success: true, data: skill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /skills
 * Create a new skill.
 */
router.post('/skills', async (req, res) => {
  try {
    const { skill_english, skill_hindi, sequence, is_active } = req.body;
    if (!skill_english || !skill_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const skill = await Skill.create({ skill_english, skill_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /skills/:id
 * Update an existing skill.
 */
router.put('/skills/:id', async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found' });
    const { skill_english, skill_hindi, sequence, is_active } = req.body;
    await skill.update({ skill_english: skill_english || skill.skill_english, skill_hindi: skill_hindi || skill.skill_hindi, sequence: sequence !== undefined ? sequence : skill.sequence, is_active: is_active !== undefined ? is_active : skill.is_active });
    res.json({ success: true, data: skill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /skills/:id
 * Permanently delete a skill.
 */
router.delete('/skills/:id', async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found' });
    await skill.destroy();
    res.json({ success: true, message: 'Skill deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /skills/bulk/sequence
 * Update sequence values for multiple skills.
 */
router.put('/skills/bulk/sequence', async (req, res) => {
  try {
    const { skills } = req.body;
    if (!Array.isArray(skills)) return res.status(400).json({ success: false, message: 'Skills array required' });
    await Promise.all(skills.map((skill) => Skill.update({ sequence: skill.sequence }, { where: { id: skill.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /qualifications
 * List all qualifications ordered by sequence.
 */
router.get('/qualifications', async (req, res) => {
  try {
    const qualifications = await Qualification.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: qualifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /qualifications/:id
 * Retrieve a single qualification by id.
 */
router.get('/qualifications/:id', async (req, res) => {
  try {
    const qualification = await Qualification.findByPk(req.params.id);
    if (!qualification) return res.status(404).json({ success: false, message: 'Qualification not found' });
    res.json({ success: true, data: qualification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /qualifications
 * Create a new qualification.
 */
router.post('/qualifications', async (req, res) => {
  try {
    const { qualification_english, qualification_hindi, sequence, is_active } = req.body;
    if (!qualification_english || !qualification_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const qualification = await Qualification.create({ qualification_english, qualification_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: qualification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /qualifications/:id
 * Update an existing qualification.
 */
router.put('/qualifications/:id', async (req, res) => {
  try {
    const qualification = await Qualification.findByPk(req.params.id);
    if (!qualification) return res.status(404).json({ success: false, message: 'Qualification not found' });
    const { qualification_english, qualification_hindi, sequence, is_active } = req.body;
    await qualification.update({ qualification_english: qualification_english || qualification.qualification_english, qualification_hindi: qualification_hindi || qualification.qualification_hindi, sequence: sequence !== undefined ? sequence : qualification.sequence, is_active: is_active !== undefined ? is_active : qualification.is_active });
    res.json({ success: true, data: qualification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /qualifications/:id
 * Permanently delete a qualification.
 */
router.delete('/qualifications/:id', async (req, res) => {
  try {
    const qualification = await Qualification.findByPk(req.params.id);
    if (!qualification) return res.status(404).json({ success: false, message: 'Qualification not found' });
    await qualification.destroy();
    res.json({ success: true, message: 'Qualification deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /qualifications/bulk/sequence
 * Update sequence values for multiple qualifications.
 */
router.put('/qualifications/bulk/sequence', async (req, res) => {
  try {
    const { qualifications } = req.body;
    if (!Array.isArray(qualifications)) return res.status(400).json({ success: false, message: 'Qualifications array required' });
    await Promise.all(qualifications.map((qualification) => Qualification.update({ sequence: qualification.sequence }, { where: { id: qualification.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /shifts
 * List all shifts ordered by sequence.
 */
router.get('/shifts', async (req, res) => {
  try {
    const shifts = await Shift.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: shifts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /shifts/:id
 * Retrieve a single shift by id.
 */
router.get('/shifts/:id', async (req, res) => {
  try {
    const shift = await Shift.findByPk(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /shifts
 * Create a new shift.
 */
router.post('/shifts', async (req, res) => {
  try {
    const { shift_english, shift_hindi, shift_from, shift_to, sequence, is_active } = req.body;
    if (!shift_english || !shift_hindi || !shift_from || !shift_to) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const shift = await Shift.create({ shift_english, shift_hindi, shift_from, shift_to, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /shifts/:id
 * Update an existing shift.
 */
router.put('/shifts/:id', async (req, res) => {
  try {
    const shift = await Shift.findByPk(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
    const { shift_english, shift_hindi, shift_from, shift_to, sequence, is_active } = req.body;
    await shift.update({ shift_english: shift_english || shift.shift_english, shift_hindi: shift_hindi || shift.shift_hindi, shift_from: shift_from || shift.shift_from, shift_to: shift_to || shift.shift_to, sequence: sequence !== undefined ? sequence : shift.sequence, is_active: is_active !== undefined ? is_active : shift.is_active });
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /shifts/:id
 * Permanently delete a shift.
 */
router.delete('/shifts/:id', async (req, res) => {
  try {
    const shift = await Shift.findByPk(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
    await shift.destroy();
    res.json({ success: true, message: 'Shift deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /shifts/bulk/sequence
 * Update sequence values for multiple shifts.
 */
router.put('/shifts/bulk/sequence', async (req, res) => {
  try {
    const { shifts } = req.body;
    if (!Array.isArray(shifts)) return res.status(400).json({ success: false, message: 'Shifts array required' });
    await Promise.all(shifts.map((shift) => Shift.update({ sequence: shift.sequence }, { where: { id: shift.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /job-profiles
 * List all job profiles ordered by sequence.
 */
router.get('/job-profiles', async (req, res) => {
  try {
    const profiles = await JobProfile.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: profiles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /job-profiles/:id
 * Retrieve a single job profile by id.
 */
router.get('/job-profiles/:id', async (req, res) => {
  try {
    const profile = await JobProfile.findByPk(req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: 'Job Profile not found' });
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /job-profiles
 * Create a new job profile.
 */
router.post('/job-profiles', async (req, res) => {
  try {
    const { profile_english, profile_hindi, profile_image, sequence, is_active } = req.body;
    if (!profile_english || !profile_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const profile = await JobProfile.create({ profile_english, profile_hindi, profile_image: profile_image || null, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /job-profiles/:id
 * Update an existing job profile.
 */
router.put('/job-profiles/:id', async (req, res) => {
  try {
    const profile = await JobProfile.findByPk(req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: 'Job Profile not found' });
    const { profile_english, profile_hindi, profile_image, sequence, is_active } = req.body;
    await profile.update({ profile_english: profile_english || profile.profile_english, profile_hindi: profile_hindi || profile.profile_hindi, profile_image: profile_image !== undefined ? profile_image : profile.profile_image, sequence: sequence !== undefined ? sequence : profile.sequence, is_active: is_active !== undefined ? is_active : profile.is_active });
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /job-profiles/:id
 * Permanently delete a job profile.
 */
router.delete('/job-profiles/:id', async (req, res) => {
  try {
    const profile = await JobProfile.findByPk(req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: 'Job Profile not found' });
    await profile.destroy();
    res.json({ success: true, message: 'Job Profile deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /job-profiles/bulk/sequence
 * Update sequence values for multiple job profiles.
 */
router.put('/job-profiles/bulk/sequence', async (req, res) => {
  try {
    const { profiles } = req.body;
    if (!Array.isArray(profiles)) return res.status(400).json({ success: false, message: 'Profiles array required' });
    await Promise.all(profiles.map((profile) => JobProfile.update({ sequence: profile.sequence }, { where: { id: profile.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /document-types
 * List all document types ordered by sequence.
 */
router.get('/document-types', async (req, res) => {
  try {
    const types = await DocumentType.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: types });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /document-types/:id
 * Retrieve a single document type by id.
 */
router.get('/document-types/:id', async (req, res) => {
  try {
    const type = await DocumentType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Document Type not found' });
    res.json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /document-types
 * Create a new document type.
 */
router.post('/document-types', async (req, res) => {
  try {
    const { type_english, type_hindi, sequence, is_active } = req.body;
    if (!type_english || !type_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const type = await DocumentType.create({ type_english, type_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /document-types/:id
 * Update an existing document type.
 */
router.put('/document-types/:id', async (req, res) => {
  try {
    const type = await DocumentType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Document Type not found' });
    const { type_english, type_hindi, sequence, is_active } = req.body;
    await type.update({ type_english: type_english || type.type_english, type_hindi: type_hindi || type.type_hindi, sequence: sequence !== undefined ? sequence : type.sequence, is_active: is_active !== undefined ? is_active : type.is_active });
    res.json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /document-types/:id
 * Permanently delete a document type.
 */
router.delete('/document-types/:id', async (req, res) => {
  try {
    const type = await DocumentType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Document Type not found' });
    await type.destroy();
    res.json({ success: true, message: 'Document Type deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /document-types/bulk/sequence
 * Update sequence values for multiple document types.
 */
router.put('/document-types/bulk/sequence', async (req, res) => {
  try {
    const { types } = req.body;
    if (!Array.isArray(types)) return res.status(400).json({ success: false, message: 'Types array required' });
    await Promise.all(types.map((type) => DocumentType.update({ sequence: type.sequence }, { where: { id: type.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /work-natures
 * List all work natures ordered by sequence.
 */
router.get('/work-natures', async (req, res) => {
  try {
    const natures = await WorkNature.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: natures });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /work-natures/:id
 * Retrieve a single work nature by id.
 */
router.get('/work-natures/:id', async (req, res) => {
  try {
    const nature = await WorkNature.findByPk(req.params.id);
    if (!nature) return res.status(404).json({ success: false, message: 'Work Nature not found' });
    res.json({ success: true, data: nature });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /work-natures
 * Create a new work nature.
 */
router.post('/work-natures', async (req, res) => {
  try {
    const { nature_english, nature_hindi, sequence, is_active } = req.body;
    if (!nature_english || !nature_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const nature = await WorkNature.create({ nature_english, nature_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: nature });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /work-natures/:id
 * Update an existing work nature.
 */
router.put('/work-natures/:id', async (req, res) => {
  try {
    const nature = await WorkNature.findByPk(req.params.id);
    if (!nature) return res.status(404).json({ success: false, message: 'Work Nature not found' });
    const { nature_english, nature_hindi, sequence, is_active } = req.body;
    await nature.update({ nature_english: nature_english || nature.nature_english, nature_hindi: nature_hindi || nature.nature_hindi, sequence: sequence !== undefined ? sequence : nature.sequence, is_active: is_active !== undefined ? is_active : nature.is_active });
    res.json({ success: true, data: nature });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /work-natures/:id
 * Permanently delete a work nature.
 */
router.delete('/work-natures/:id', async (req, res) => {
  try {
    const nature = await WorkNature.findByPk(req.params.id);
    if (!nature) return res.status(404).json({ success: false, message: 'Work Nature not found' });
    await nature.destroy();
    res.json({ success: true, message: 'Work Nature deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /work-natures/bulk/sequence
 * Update sequence values for multiple work natures.
 */
router.put('/work-natures/bulk/sequence', async (req, res) => {
  try {
    const { natures } = req.body;
    if (!Array.isArray(natures)) return res.status(400).json({ success: false, message: 'Natures array required' });
    await Promise.all(natures.map((nature) => WorkNature.update({ sequence: nature.sequence }, { where: { id: nature.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /salary-ranges
 * List all salary ranges ordered by id.
 */
router.get('/salary-ranges', async (req, res) => {
  try {
    const ranges = await SalaryRange.findAll({ order: [['id', 'ASC']] });
    res.json({ success: true, data: ranges });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /salary-ranges/:id
 * Retrieve a single salary range by id.
 */
router.get('/salary-ranges/:id', async (req, res) => {
  try {
    const range = await SalaryRange.findByPk(req.params.id);
    if (!range) return res.status(404).json({ success: false, message: 'Salary Range not found' });
    res.json({ success: true, data: range });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /salary-ranges
 * Create a new salary range.
 */
router.post('/salary-ranges', async (req, res) => {
  try {
    const { salary_from, salary_to, is_active } = req.body;
    if (!salary_from || !salary_to) {
      return res.status(400).json({ success: false, message: 'Salary from and to are required' });
    }
    const range = await SalaryRange.create({ salary_from, salary_to, is_active: is_active !== false });
    res.status(201).json({ success: true, data: range });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /salary-ranges/:id
 * Update an existing salary range.
 */
router.put('/salary-ranges/:id', async (req, res) => {
  try {
    const range = await SalaryRange.findByPk(req.params.id);
    if (!range) return res.status(404).json({ success: false, message: 'Salary Range not found' });
    const { salary_from, salary_to, is_active } = req.body;
    await range.update({ salary_from: salary_from || range.salary_from, salary_to: salary_to || range.salary_to, is_active: is_active !== undefined ? is_active : range.is_active });
    res.json({ success: true, data: range });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /salary-ranges/:id
 * Permanently delete a salary range.
 */
router.delete('/salary-ranges/:id', async (req, res) => {
  try {
    const range = await SalaryRange.findByPk(req.params.id);
    if (!range) return res.status(404).json({ success: false, message: 'Salary Range not found' });
    await range.destroy();
    res.json({ success: true, message: 'Salary Range deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /business-categories
 * List all business categories ordered by sequence.
 */
router.get('/business-categories', async (req, res) => {
  try {
    const categories = await BusinessCategory.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /business-categories/:id
 * Retrieve a single business category by id.
 */
router.get('/business-categories/:id', async (req, res) => {
  try {
    const category = await BusinessCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Business Category not found' });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /business-categories
 * Create a new business category.
 */
router.post('/business-categories', async (req, res) => {
  try {
    const { category_english, category_hindi, sequence, is_active } = req.body;
    if (!category_english || !category_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const category = await BusinessCategory.create({ category_english, category_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /business-categories/:id
 * Update an existing business category.
 */
router.put('/business-categories/:id', async (req, res) => {
  try {
    const category = await BusinessCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Business Category not found' });
    const { category_english, category_hindi, sequence, is_active } = req.body;
    await category.update({ category_english: category_english || category.category_english, category_hindi: category_hindi || category.category_hindi, sequence: sequence !== undefined ? sequence : category.sequence, is_active: is_active !== undefined ? is_active : category.is_active });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /business-categories/:id
 * Permanently delete a business category.
 */
router.delete('/business-categories/:id', async (req, res) => {
  try {
    const category = await BusinessCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Business Category not found' });
    await category.destroy();
    res.json({ success: true, message: 'Business Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /business-categories/bulk/sequence
 * Update sequence values for multiple business categories.
 */
router.put('/business-categories/bulk/sequence', async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) return res.status(400).json({ success: false, message: 'Categories array required' });
    await Promise.all(categories.map((category) => BusinessCategory.update({ sequence: category.sequence }, { where: { id: category.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /experiences
 * List all experience ranges ordered by sequence.
 */
router.get('/experiences', async (req, res) => {
  try {
    const experiences = await Experience.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: experiences });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /experiences/:id
 * Retrieve a single experience range by id.
 */
router.get('/experiences/:id', async (req, res) => {
  try {
    const experience = await Experience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Experience not found' });
    res.json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /experiences
 * Create a new experience range.
 */
router.post('/experiences', async (req, res) => {
  try {
    const { title_english, title_hindi, exp_from, exp_to, sequence, is_active } = req.body;
    if (!title_english || !title_hindi || exp_from === undefined || exp_to === undefined) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided' });
    }
    const experience = await Experience.create({ title_english, title_hindi, exp_from, exp_to, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /experiences/:id
 * Update an existing experience range.
 */
router.put('/experiences/:id', async (req, res) => {
  try {
    const experience = await Experience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Experience not found' });
    const { title_english, title_hindi, exp_from, exp_to, sequence, is_active } = req.body;
    await experience.update({ title_english: title_english || experience.title_english, title_hindi: title_hindi || experience.title_hindi, exp_from: exp_from !== undefined ? exp_from : experience.exp_from, exp_to: exp_to !== undefined ? exp_to : experience.exp_to, sequence: sequence !== undefined ? sequence : experience.sequence, is_active: is_active !== undefined ? is_active : experience.is_active });
    res.json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /experiences/:id
 * Permanently delete an experience range.
 */
router.delete('/experiences/:id', async (req, res) => {
  try {
    const experience = await Experience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Experience not found' });
    await experience.destroy();
    res.json({ success: true, message: 'Experience deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /experiences/bulk/sequence
 * Update sequence values for multiple experience ranges.
 */
router.put('/experiences/bulk/sequence', async (req, res) => {
  try {
    const { experiences } = req.body;
    if (!Array.isArray(experiences)) return res.status(400).json({ success: false, message: 'Experiences array required' });
    await Promise.all(experiences.map((exp) => Experience.update({ sequence: exp.sequence }, { where: { id: exp.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /salary-types
 * List all salary types ordered by sequence.
 */
router.get('/salary-types', async (req, res) => {
  try {
    const types = await SalaryType.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: types });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /salary-types/:id
 * Retrieve a single salary type by id.
 */
router.get('/salary-types/:id', async (req, res) => {
  try {
    const type = await SalaryType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Salary Type not found' });
    res.json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /salary-types
 * Create a new salary type.
 */
router.post('/salary-types', async (req, res) => {
  try {
    const { type_english, type_hindi, sequence, is_active } = req.body;
    if (!type_english || !type_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const type = await SalaryType.create({ type_english, type_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /salary-types/:id
 * Update an existing salary type.
 */
router.put('/salary-types/:id', async (req, res) => {
  try {
    const type = await SalaryType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Salary Type not found' });
    const { type_english, type_hindi, sequence, is_active } = req.body;
    await type.update({ type_english: type_english || type.type_english, type_hindi: type_hindi || type.type_hindi, sequence: sequence !== undefined ? sequence : type.sequence, is_active: is_active !== undefined ? is_active : type.is_active });
    res.json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /salary-types/:id
 * Permanently delete a salary type.
 */
router.delete('/salary-types/:id', async (req, res) => {
  try {
    const type = await SalaryType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Salary Type not found' });
    await type.destroy();
    res.json({ success: true, message: 'Salary Type deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /distances
 * List all distance options ordered by sequence.
 */
router.get('/distances', async (req, res) => {
  try {
    const distances = await Distance.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: distances });
  } catch (error) {
    console.error('Distances fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /distances/:id
 * Retrieve a single distance option by id.
 */
router.get('/distances/:id', async (req, res) => {
  try {
    const distance = await Distance.findByPk(req.params.id);
    if (!distance) return res.status(404).json({ success: false, message: 'Distance not found' });
    res.json({ success: true, data: distance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /distances
 * Create a new distance option.
 */
router.post('/distances', async (req, res) => {
  try {
    const { title_english, title_hindi, distance, sequence, is_active } = req.body;
    if (!title_english || !title_hindi || distance === undefined) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided' });
    }
    const dist = await Distance.create({ title_english, title_hindi, distance, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: dist });
  } catch (error) {
    console.error('Distance creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /distances/:id
 * Update an existing distance option.
 */
router.put('/distances/:id', async (req, res) => {
  try {
    const distance = await Distance.findByPk(req.params.id);
    if (!distance) return res.status(404).json({ success: false, message: 'Distance not found' });
    const { title_english, title_hindi, distance: dist, sequence, is_active } = req.body;
    await distance.update({ title_english: title_english || distance.title_english, title_hindi: title_hindi || distance.title_hindi, distance: dist !== undefined ? dist : distance.distance, sequence: sequence !== undefined ? sequence : distance.sequence, is_active: is_active !== undefined ? is_active : distance.is_active });
    res.json({ success: true, data: distance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /distances/:id
 * Permanently delete a distance option.
 */
router.delete('/distances/:id', async (req, res) => {
  try {
    const distance = await Distance.findByPk(req.params.id);
    if (!distance) return res.status(404).json({ success: false, message: 'Distance not found' });
    await distance.destroy();
    res.json({ success: true, message: 'Distance deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /distances/bulk/sequence
 * Update sequence values for multiple distance options.
 */
router.put('/distances/bulk/sequence', async (req, res) => {
  try {
    const { distances } = req.body;
    if (!Array.isArray(distances)) return res.status(400).json({ success: false, message: 'Distances array required' });
    await Promise.all(distances.map((dist) => Distance.update({ sequence: dist.sequence }, { where: { id: dist.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employee-call-experience
 * List employee call experience options ordered by sequence.
 */
router.get('/employee-call-experience', async (req, res) => {
  try {
    console.log('Fetching employee call experiences...');
    const experiences = await EmployeeCallExperience.findAll({ 
      order: [['sequence', 'ASC']] 
    });
    console.log('Found experiences:', experiences.length);
    res.json({ success: true, data: experiences });
  } catch (error) {
    console.error('Employee Call Experience fetch error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employee-call-experience/:id
 * Retrieve a single employee call experience by id.
 */
router.get('/employee-call-experience/:id', async (req, res) => {
  try {
    const experience = await EmployeeCallExperience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Call Experience not found' });
    res.json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employee-call-experience
 * Create a new employee call experience option.
 */
router.post('/employee-call-experience', async (req, res) => {
  try {
    const { experience_english, experience_hindi, sequence, is_active } = req.body;
    if (!experience_english || !experience_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const experience = await EmployeeCallExperience.create({ 
      experience_english, 
      experience_hindi, 
      sequence: sequence || null, 
      is_active: is_active !== false 
    });
    res.status(201).json({ success: true, data: experience });
  } catch (error) {
    console.error('Employee Call Experience creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employee-call-experience/:id
 * Update an existing employee call experience option.
 */
router.put('/employee-call-experience/:id', async (req, res) => {
  try {
    const experience = await EmployeeCallExperience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Call Experience not found' });
    const { experience_english, experience_hindi, sequence, is_active } = req.body;
    await experience.update({ 
      experience_english: experience_english || experience.experience_english, 
      experience_hindi: experience_hindi || experience.experience_hindi, 
      sequence: sequence !== undefined ? sequence : experience.sequence, 
      is_active: is_active !== undefined ? is_active : experience.is_active 
    });
    res.json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employee-call-experience/:id
 * Permanently delete an employee call experience option.
 */
router.delete('/employee-call-experience/:id', async (req, res) => {
  try {
    const experience = await EmployeeCallExperience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Call Experience not found' });
    await experience.destroy();
    res.json({ success: true, message: 'Call Experience deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employee-call-experience/bulk/sequence
 * Update sequence values for multiple employee call experiences.
 */
router.put('/employee-call-experience/bulk/sequence', async (req, res) => {
  try {
    const { experiences } = req.body;
    if (!Array.isArray(experiences)) return res.status(400).json({ success: false, message: 'Experiences array required' });
    await Promise.all(experiences.map((exp) => EmployeeCallExperience.update({ sequence: exp.sequence }, { where: { id: exp.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employee-report-reasons
 * List employee report reasons ordered by sequence.
 */
router.get('/employee-report-reasons', async (req, res) => {
  try {
    const reasons = await EmployeeReportReason.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: reasons });
  } catch (error) {
    console.error('Employee Report Reasons fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employee-report-reasons/:id
 * Retrieve a single employee report reason by id.
 */
router.get('/employee-report-reasons/:id', async (req, res) => {
  try {
    const reason = await EmployeeReportReason.findByPk(req.params.id);
    if (!reason) return res.status(404).json({ success: false, message: 'Report Reason not found' });
    res.json({ success: true, data: reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employee-report-reasons
 * Create a new employee report reason.
 */
router.post('/employee-report-reasons', async (req, res) => {
  try {
    const { reason_english, reason_hindi, sequence, is_active } = req.body;
    if (!reason_english || !reason_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const reason = await EmployeeReportReason.create({ reason_english, reason_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: reason });
  } catch (error) {
    console.error('Employee Report Reason creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employee-report-reasons/:id
 * Update an existing employee report reason.
 */
router.put('/employee-report-reasons/:id', async (req, res) => {
  try {
    const reason = await EmployeeReportReason.findByPk(req.params.id);
    if (!reason) return res.status(404).json({ success: false, message: 'Report Reason not found' });
    const { reason_english, reason_hindi, sequence, is_active } = req.body;
    await reason.update({ reason_english: reason_english || reason.reason_english, reason_hindi: reason_hindi || reason.reason_hindi, sequence: sequence !== undefined ? sequence : reason.sequence, is_active: is_active !== undefined ? is_active : reason.is_active });
    res.json({ success: true, data: reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employee-report-reasons/:id
 * Permanently delete an employee report reason.
 */
router.delete('/employee-report-reasons/:id', async (req, res) => {
  try {
    const reason = await EmployeeReportReason.findByPk(req.params.id);
    if (!reason) return res.status(404).json({ success: false, message: 'Report Reason not found' });
    await reason.destroy();
    res.json({ success: true, message: 'Report Reason deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /vacancy-numbers
 * List vacancy number options ordered by sequence.
 */
router.get('/vacancy-numbers', async (req, res) => {
  try {
    const numbers = await VacancyNumber.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: numbers });
  } catch (error) {
    console.error('Vacancy Numbers fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /vacancy-numbers/:id
 * Retrieve a single vacancy number option by id.
 */
router.get('/vacancy-numbers/:id', async (req, res) => {
  try {
    const number = await VacancyNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'Vacancy Number not found' });
    res.json({ success: true, data: number });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /vacancy-numbers
 * Create a new vacancy number option.
 */
router.post('/vacancy-numbers', async (req, res) => {
  try {
    const { number_english, number_hindi, sequence, is_active } = req.body;
    if (!number_english || !number_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const number = await VacancyNumber.create({ number_english, number_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: number });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /vacancy-numbers/:id
 * Update an existing vacancy number option.
 */
router.put('/vacancy-numbers/:id', async (req, res) => {
  try {
    const number = await VacancyNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'Vacancy Number not found' });
    const { number_english, number_hindi, sequence, is_active } = req.body;
    await number.update({ number_english: number_english || number.number_english, number_hindi: number_hindi || number.number_hindi, sequence: sequence !== undefined ? sequence : number.sequence, is_active: is_active !== undefined ? is_active : number.is_active });
    res.json({ success: true, data: number });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /vacancy-numbers/:id
 * Permanently delete a vacancy number option.
 */
router.delete('/vacancy-numbers/:id', async (req, res) => {
  try {
    const number = await VacancyNumber.findByPk(req.params.id);
    if (!number) return res.status(404).json({ success: false, message: 'Vacancy Number not found' });
    await number.destroy();
    res.json({ success: true, message: 'Vacancy Number deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /job-benefits
 * List job benefits ordered by sequence.
 */
router.get('/job-benefits', async (req, res) => {
  try {
    const benefits = await JobBenefit.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: benefits });
  } catch (error) {
    console.error('Job Benefits fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /job-benefits/:id
 * Retrieve a single job benefit by id.
 */
router.get('/job-benefits/:id', async (req, res) => {
  try {
    const benefit = await JobBenefit.findByPk(req.params.id);
    if (!benefit) return res.status(404).json({ success: false, message: 'Job Benefit not found' });
    res.json({ success: true, data: benefit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /job-benefits
 * Create a new job benefit.
 */
router.post('/job-benefits', async (req, res) => {
  try {
    const { benefit_english, benefit_hindi, sequence, is_active } = req.body;
    if (!benefit_english || !benefit_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const benefit = await JobBenefit.create({ benefit_english, benefit_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: benefit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /job-benefits/:id
 * Update an existing job benefit.
 */
router.put('/job-benefits/:id', async (req, res) => {
  try {
    const benefit = await JobBenefit.findByPk(req.params.id);
    if (!benefit) return res.status(404).json({ success: false, message: 'Job Benefit not found' });
    const { benefit_english, benefit_hindi, sequence, is_active } = req.body;
    await benefit.update({ benefit_english: benefit_english || benefit.benefit_english, benefit_hindi: benefit_hindi || benefit.benefit_hindi, sequence: sequence !== undefined ? sequence : benefit.sequence, is_active: is_active !== undefined ? is_active : benefit.is_active });
    res.json({ success: true, data: benefit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /job-benefits/:id
 * Permanently delete a job benefit.
 */
router.delete('/job-benefits/:id', async (req, res) => {
  try {
    const benefit = await JobBenefit.findByPk(req.params.id);
    if (!benefit) return res.status(404).json({ success: false, message: 'Job Benefit not found' });
    await benefit.destroy();
    res.json({ success: true, message: 'Job Benefit deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employer-call-experience
 * List employer call experience options ordered by sequence.
 */
router.get('/employer-call-experience', async (req, res) => {
  try {
    const experiences = await EmployerCallExperience.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: experiences });
  } catch (error) {
    console.error('Employer Call Experience fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employer-call-experience/:id
 * Retrieve a single employer call experience by id.
 */
router.get('/employer-call-experience/:id', async (req, res) => {
  try {
    const experience = await EmployerCallExperience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Call Experience not found' });
    res.json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employer-call-experience
 * Create a new employer call experience option.
 */
router.post('/employer-call-experience', async (req, res) => {
  try {
    const { experience_english, experience_hindi, sequence, is_active } = req.body;
    if (!experience_english || !experience_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const experience = await EmployerCallExperience.create({ experience_english, experience_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: experience });
  } catch (error) {
    console.error('Employer Call Experience creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employer-call-experience/:id
 * Update an existing employer call experience option.
 */
router.put('/employer-call-experience/:id', async (req, res) => {
  try {
    const experience = await EmployerCallExperience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Call Experience not found' });
    const { experience_english, experience_hindi, sequence, is_active } = req.body;
    await experience.update({ experience_english: experience_english || experience.experience_english, experience_hindi: experience_hindi || experience.experience_hindi, sequence: sequence !== undefined ? sequence : experience.sequence, is_active: is_active !== undefined ? is_active : experience.is_active });
    res.json({ success: true, data: experience });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employer-call-experience/:id
 * Permanently delete an employer call experience option.
 */
router.delete('/employer-call-experience/:id', async (req, res) => {
  try {
    const experience = await EmployerCallExperience.findByPk(req.params.id);
    if (!experience) return res.status(404).json({ success: false, message: 'Call Experience not found' });
    await experience.destroy();
    res.json({ success: true, message: 'Call Experience deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employer-call-experience/bulk/sequence
 * Update sequence values for multiple employer call experiences.
 */
router.put('/employer-call-experience/bulk/sequence', async (req, res) => {
  try {
    const { experiences } = req.body;
    if (!Array.isArray(experiences)) return res.status(400).json({ success: false, message: 'Experiences array required' });
    await Promise.all(experiences.map((exp) => EmployerCallExperience.update({ sequence: exp.sequence }, { where: { id: exp.id } })));
    res.json({ success: true, message: 'Sequences updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employer-report-reasons
 * List employer report reasons ordered by sequence.
 */
router.get('/employer-report-reasons', async (req, res) => {
  try {
    const reasons = await EmployerReportReason.findAll({ order: [['sequence', 'ASC']] });
    res.json({ success: true, data: reasons });
  } catch (error) {
    console.error('Employer Report Reasons fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employer-report-reasons/:id
 * Retrieve a single employer report reason by id.
 */
router.get('/employer-report-reasons/:id', async (req, res) => {
  try {
    const reason = await EmployerReportReason.findByPk(req.params.id);
    if (!reason) return res.status(404).json({ success: false, message: 'Report Reason not found' });
    res.json({ success: true, data: reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employer-report-reasons
 * Create a new employer report reason.
 */
router.post('/employer-report-reasons', async (req, res) => {
  try {
    const { reason_english, reason_hindi, sequence, is_active } = req.body;
    if (!reason_english || !reason_hindi) {
      return res.status(400).json({ success: false, message: 'English and Hindi names are required' });
    }
    const reason = await EmployerReportReason.create({ reason_english, reason_hindi, sequence: sequence || null, is_active: is_active !== false });
    res.status(201).json({ success: true, data: reason });
  } catch (error) {
    console.error('Employer Report Reason creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employer-report-reasons/:id
 * Update an existing employer report reason.
 */
router.put('/employer-report-reasons/:id', async (req, res) => {
  try {
    const reason = await EmployerReportReason.findByPk(req.params.id);
    if (!reason) return res.status(404).json({ success: false, message: 'Report Reason not found' });
    const { reason_english, reason_hindi, sequence, is_active } = req.body;
    await reason.update({ reason_english: reason_english || reason.reason_english, reason_hindi: reason_hindi || reason.reason_hindi, sequence: sequence !== undefined ? sequence : reason.sequence, is_active: is_active !== undefined ? is_active : reason.is_active });
    res.json({ success: true, data: reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employer-report-reasons/:id
 * Permanently delete an employer report reason.
 */
router.delete('/employer-report-reasons/:id', async (req, res) => {
  try {
    const reason = await EmployerReportReason.findByPk(req.params.id);
    if (!reason) return res.status(404).json({ success: false, message: 'Report Reason not found' });
    await reason.destroy();
    res.json({ success: true, message: 'Report Reason deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
