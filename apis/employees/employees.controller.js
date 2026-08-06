const { sendApiResponse, isTruthyEnv } = require('../_helpers/response');
const { sequelize } = require('../../config/db');

const Employee = require('../../models/Employee');
const User = require('../../models/User');
const State = require('../../models/State');
const City = require('../../models/City');
const Qualification = require('../../models/Qualification');
const Shift = require('../../models/Shift');
const EmployeeSubscriptionPlan = require('../../models/EmployeeSubscriptionPlan');

const EmployeeSkill = require('../../models/EmployeeSkill');
const Skill = require('../../models/Skill');

const EmployeeJobProfile = require('../../models/EmployeeJobProfile');
const JobProfile = require('../../models/JobProfile');

const EmployeeExperience = require('../../models/EmployeeExperience');
const WorkNature = require('../../models/WorkNature');
const DocumentType = require('../../models/DocumentType');
const AdditionalDocumentType = require('../../models/AdditionalDocumentType');

const EmployeeDocument = require('../../models/EmployeeDocument');
const { sendOtp: sendTwoFactorOtp, verifyOtp: verifyTwoFactorOtp } = require('../../utils/twoFactor');
const { generateAadhaarOtp, verifyAadhaarOtp: verifyAadhaarOtpApi, namesMatch } = require('../../utils/quickeKyc');
const { applyBilingualPairFromBody, normalizeNullableText } = require('../../utils/bilingual');
const {
  fetchWelcomeCreditSettings,
  buildEmployeeWelcomeCredits,
} = require('../../utils/welcomeCredits');

const SUCCESS_CODE = 'SC_01';

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function toDecimalOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isTruthy(value) {
  if (value === true) return true;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function isAtLeast18YearsOld(value) {
  if (!value) return false;
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age >= 18;
}

function normalizeDateOnlyOrNull(value) {
  if (!value) return null;
  // Accept YYYY-MM-DD or ISO
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : value;
}

function pickFirstUploadedFile(req, fieldNames) {
  if (req?.file) return req.file;
  const files = req?.files || {};
  for (const name of fieldNames || []) {
    const arr = files?.[name];
    if (Array.isArray(arr) && arr.length) return arr[0];
  }
  return null;
}

function maskAadhar(aadharNumber) {
  const digits = String(aadharNumber || '').replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  return `${'X'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function normalizeDobToYMD(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function dobsMatch(employeeDob, aadharDob) {
  const a = normalizeDobToYMD(employeeDob);
  const b = normalizeDobToYMD(aadharDob);
  if (!a || !b) return true; // skip check if either side is missing
  return a === b;
}

function normalizeIndianMobile10(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return '';

  // Accept +91XXXXXXXXXX / 91XXXXXXXXXX as well.
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  return digits;
}

async function maybeVerifyKyc(employeeInstance) {
  if (!employeeInstance) return;
  const employee = employeeInstance;
  const hasAadhar = Boolean(employee.aadhar_verified_at);
  const hasSelfie = Boolean(employee.selfie_link);

  const current = String(employee.kyc_status || '').trim().toLowerCase();
  if (hasAadhar && hasSelfie && current !== 'verified' && current !== 'pending') {
    await employee.update({ kyc_status: 'pending' });
  }
}

async function submitEmployeeProfileForReview(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    const currentVerification = String(employee.verification_status || '').trim().toLowerCase();
    const shouldMarkPending = currentVerification === 'init' || currentVerification === 'rejected' || currentVerification === '';

    if (shouldMarkPending) {
      const t = await sequelize.transaction();
      try {
        await employee.update(
          { verification_status: 'pending', verification_at: null },
          { transaction: t },
        );
        await User.update(
          { profile_completed_at: new Date() },
          { where: { id: employee.user_id }, transaction: t },
        );
        await t.commit();
      } catch (txError) {
        await t.rollback();
        throw txError;
      }
    }

    const refreshed = await Employee.findByPk(employee.id, { include: buildEmployeeInclude() });
    const payload = refreshed ? (refreshed.toJSON ? refreshed.toJSON() : refreshed) : (employee.toJSON ? employee.toJSON() : employee);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: shouldMarkPending ? 'Employee profile submitted for review successfully' : 'Employee profile already submitted for review',
      data: {
        employee: payload,
        submitted_for_review: shouldMarkPending,
      },
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/submit-for-review]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to submit employee profile for review', data: null });
  }
}

async function stampEmployeeProfileCompletedAt(employeeOrEmployeeId) {
  const employeeId = typeof employeeOrEmployeeId === 'object'
    ? toInt(employeeOrEmployeeId?.id)
    : toInt(employeeOrEmployeeId);

  if (!employeeId || employeeId <= 0) return;

  const employee = typeof employeeOrEmployeeId === 'object' && employeeOrEmployeeId?.user_id
    ? employeeOrEmployeeId
    : await Employee.findByPk(employeeId, { attributes: ['id', 'user_id'] });

  const userId = toInt(employee?.user_id);
  if (!userId || userId <= 0) return;

  await User.update(
    { profile_completed_at: new Date() },
    { where: { id: userId } },
  );
}

function buildEmployeeInclude() {
  return [
    { model: State, as: 'State', attributes: ['id', 'state_english', 'state_hindi'] },
    { model: City, as: 'City', attributes: ['id', 'state_id', 'city_english', 'city_hindi'] },
    { model: State, as: 'PreferredState', attributes: ['id', 'state_english', 'state_hindi'] },
    { model: City, as: 'PreferredCity', attributes: ['id', 'state_id', 'city_english', 'city_hindi'] },
    { model: Qualification, as: 'Qualification', attributes: ['id', 'qualification_english', 'qualification_hindi'] },
    { model: Shift, as: 'Shift', attributes: ['id', 'shift_english', 'shift_hindi', 'shift_from', 'shift_to'] },
    { model: EmployeeSubscriptionPlan, as: 'SubscriptionPlan', attributes: ['id', 'plan_name_english', 'plan_name_hindi', 'plan_validity_days', 'plan_price'] },
  ];
}

async function getEmployeeSelectedSkills(employeeId) {
  const rows = await EmployeeSkill.findAll({
    where: { user_id: employeeId },
    attributes: ['skill_id'],
    order: [['id', 'ASC']],
  });

  const skill_ids = (rows || []).map((r) => r.skill_id).filter(Boolean);
  if (!skill_ids.length) return { skill_ids: [], skills: [] };

  const skillsRows = await Skill.findAll({
    where: { id: skill_ids },
    attributes: ['id', 'skill_english', 'skill_hindi', 'sequence'],
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });

  const skills = (skillsRows || []).map((s) => (s.toJSON ? s.toJSON() : s));
  return { skill_ids, skills };
}


async function attachExperienceMeta(payload) {
  if (!payload) return payload;

  // Ensure WorkNature object exists
  if (!payload.WorkNature && payload.work_nature_id) {
    const wn = await WorkNature.findByPk(payload.work_nature_id, {
      attributes: ['id', 'nature_english', 'nature_hindi', 'sequence'],
    });
    payload.WorkNature = wn ? (wn.toJSON ? wn.toJSON() : wn) : null;
  }

  // DocumentType from document_type_id
  const docTypeId = payload.document_type_id;
  const dt = docTypeId
    ? await DocumentType.findByPk(docTypeId, { attributes: ['id', 'type_english', 'type_hindi', 'sequence'] })
    : null;
  payload.DocumentType = dt ? (dt.toJSON ? dt.toJSON() : dt) : null;

  return payload;
}

async function attachEmployeeDocumentType(payload) {
  if (!payload) return payload;

  const docTypeId = toInt(payload.document_type);
  const dt = docTypeId
    ? await AdditionalDocumentType.findByPk(docTypeId, { attributes: ['id', 'type_english', 'type_hindi', 'sequence'] })
    : null;

  payload.DocumentType = dt ? (dt.toJSON ? dt.toJSON() : dt) : null;
  payload.AdditionalDocumentType = payload.DocumentType;
  return payload;
}

async function getEmployeeById(req, res) {
  try {
    const id = toInt(req.params?.id);
    if (!id || id <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const employee = await Employee.findByPk(id, { include: buildEmployeeInclude() });
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee detail fetched successfully',
      data: { employee: employee.toJSON ? employee.toJSON() : employee },
    });
  } catch (error) {
    console.error('[app/employees/:id]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to fetch employee detail', data: null });
  }
}

async function resolveEmployeeFromParam(param, { createIfMissing = false, lookupBy = 'auto' } = {}) {
  const id = toInt(param);
  if (!id || id <= 0) return { employee: null, userId: null };

  // lookupBy: 'employee_id' — only match by employees.id (PK)
  if (lookupBy === 'employee_id') {
    const employee = await Employee.findByPk(id);
    if (!employee) return { employee: null, userId: null };
    return { employee, userId: employee.user_id };
  }

  // lookupBy: 'user_id' — only match by employees.user_id
  if (lookupBy === 'user_id') {
    let employee = await Employee.findOne({ where: { user_id: id } });
    if (employee) return { employee, userId: id };

    if (!createIfMissing) return { employee: null, userId: null };

    const user = await User.findByPk(id, { attributes: ['id'] });
    if (!user) return { employee: null, userId: null };

    const welcomeSetting = await fetchWelcomeCreditSettings();
    const welcomeCredits = buildEmployeeWelcomeCredits(welcomeSetting);
    employee = await Employee.create({ user_id: id, ...welcomeCredits });
    return { employee, userId: id };
  }

  // lookupBy: 'auto' (default) — try user_id first, then PK (legacy behaviour)
  let employee = await Employee.findOne({ where: { user_id: id } });
  if (employee) return { employee, userId: id };

  employee = await Employee.findByPk(id);
  if (employee) return { employee, userId: employee.user_id };

  if (!createIfMissing) return { employee: null, userId: null };

  const user = await User.findByPk(id, { attributes: ['id'] });
  if (!user) return { employee: null, userId: null };

  const welcomeSetting = await fetchWelcomeCreditSettings();
  const welcomeCredits = buildEmployeeWelcomeCredits(welcomeSetting);
  employee = await Employee.create({ user_id: id, ...welcomeCredits });
  return { employee, userId: id };
}

async function savePersonalInfo(req, res) {
  try {
    const { employee, userId } = await resolveEmployeeFromParam(req.params?.id, { createIfMissing: true, lookupBy: 'user_id' });
    if (!employee || !userId) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee/user id is required', data: null });
    }

    const user = await User.findByPk(userId, { attributes: ['id', 'name', 'name_hindi'] });

    // --- Required field validation ---
    const body = req.body || {};
    const isEditProfile = isTruthy(body.is_edit_profile);
    const validationErrors = [];
    const existingNameVal = String(employee.name || '').trim() || String(user?.name || '').trim();
    const nameVal = isEditProfile ? existingNameVal : (body.name ?? '').toString().trim();
    if (!nameVal) validationErrors.push('Name is required');
    const dobVal = isEditProfile
      ? String(employee.dob || '').trim()
      : (body.dob ?? '').toString().trim();
    if (!dobVal) validationErrors.push('Date of birth is required');
    if (dobVal && !isAtLeast18YearsOld(dobVal)) {
      validationErrors.push('User must be at least 18 years old');
    }
    const genderVal = isEditProfile
      ? String(employee.gender || '').trim()
      : (body.gender ?? '').toString().trim();
    if (!genderVal) validationErrors.push('Gender is required');
    if (!toInt(body.state_id)) validationErrors.push('State is required');
    if (!toInt(body.city_id)) validationErrors.push('City is required');
    if (!toInt(body.preferred_state_id)) validationErrors.push('Preferred job state is required');
    if (!toInt(body.preferred_city_id)) validationErrors.push('Preferred job city is required');
    if (!toInt(body.qualification_id)) validationErrors.push('Qualification is required');
    if (toDecimalOrNull(body.expected_salary) == null) validationErrors.push('Expected salary is required');
    if (!toInt(body.preferred_shift_id)) validationErrors.push('Preferred shift is required');
    if (validationErrors.length > 0) {
      return sendApiResponse(res, { ok: false, code: 'VALIDATION_ERROR', message: validationErrors[0], data: { errors: validationErrors } });
    }
    // --- End validation ---

    // If client is updating the user's name, persist it on User too.
    // This keeps auth user data consistent and allows name_hindi to be stored.
    const wantsUserNameUpdate = !isEditProfile && (
      Object.prototype.hasOwnProperty.call(req.body || {}, 'name') ||
      Object.prototype.hasOwnProperty.call(req.body || {}, 'name_hindi')
    );
    if (user && wantsUserNameUpdate) {
      const userPayload = {};
      await applyBilingualPairFromBody({
        body: req.body || {},
        payload: userPayload,
        englishKey: 'name',
        hindiKey: 'name_hindi',
        existing: user,
      });
      if (Object.keys(userPayload).length) {
        await user.update(userPayload);
      }
    }

    const hasEmail = Object.prototype.hasOwnProperty.call(req.body || {}, 'email');
    const hasAbout = Object.prototype.hasOwnProperty.call(req.body || {}, 'about_user');
    const nextEmail = hasEmail ? (req.body?.email ?? null) : employee.email;
    const nextAbout = hasAbout ? normalizeNullableText(req.body?.about_user) : employee.about_user;

    const payload = {
      ...(!isEditProfile && !String(employee.name || '').trim() && user?.name ? { name: user.name } : {}),
      dob: isEditProfile ? employee.dob : normalizeDateOnlyOrNull(req.body?.dob),
      gender: isEditProfile ? employee.gender : (req.body?.gender ?? null),
      state_id: toInt(req.body?.state_id),
      city_id: toInt(req.body?.city_id),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'lat') || Object.prototype.hasOwnProperty.call(req.body || {}, 'latitude')
        ? { lat: toDecimalOrNull(req.body?.lat ?? req.body?.latitude) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'lng') || Object.prototype.hasOwnProperty.call(req.body || {}, 'longitude')
        ? { lng: toDecimalOrNull(req.body?.lng ?? req.body?.longitude) }
        : {}),
      preferred_state_id: toInt(req.body?.preferred_state_id),
      preferred_city_id: toInt(req.body?.preferred_city_id),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'preferred_location')
        ? { preferred_location: req.body?.preferred_location ?? null }
        : {}),
      qualification_id: toInt(req.body?.qualification_id),
      expected_salary: toDecimalOrNull(req.body?.expected_salary),
      expected_salary_frequency: req.body?.expected_salary_frequency ?? null,
      preferred_shift_id: toInt(req.body?.preferred_shift_id),
      assistant_code: req.body?.assistant_code ?? null,
      email: nextEmail,
      about_user: nextAbout,
    };

    // Bilingual fields (base + _hindi). If either side is provided, translate/fill and persist both.
    if (!isEditProfile) {
      await applyBilingualPairFromBody({ body: req.body || {}, payload, englishKey: 'name', hindiKey: 'name_hindi', existing: employee });
    }
    await applyBilingualPairFromBody({ body: req.body || {}, payload, englishKey: 'about_user', hindiKey: 'about_user_hindi', existing: employee });

    const sameText = (a, b) => normalizeNullableText(a) === normalizeNullableText(b);
    const willAboutChange = (
      Object.prototype.hasOwnProperty.call(payload, 'about_user') && !sameText(payload.about_user, employee.about_user)
    ) || (
      Object.prototype.hasOwnProperty.call(payload, 'about_user_hindi') && !sameText(payload.about_user_hindi, employee.about_user_hindi)
    );

    if (isEditProfile && willAboutChange) {
      const currentVerification = String(employee.verification_status || '').trim().toLowerCase();
      if (currentVerification !== 'init') {
        payload.verification_status = 'pending';
        payload.verification_at = null;
      }
    }

    await employee.update(payload);

    // Skills
    const rawSkillIds = req.body?.skill_ids;
    const skillIds = Array.isArray(rawSkillIds) ? rawSkillIds.map(toInt).filter(Boolean) : [];

    if (Array.isArray(rawSkillIds)) {
      await EmployeeSkill.destroy({ where: { user_id: employee.id } });
      if (skillIds.length) {
        await EmployeeSkill.bulkCreate(
          skillIds.map((skill_id) => ({ user_id: employee.id, skill_id })),
          { ignoreDuplicates: true },
        );
      }
    }

    const updated = await Employee.findByPk(employee.id, { include: buildEmployeeInclude() });
    const employeeJson = updated ? (updated.toJSON ? updated.toJSON() : updated) : null;

    if (employeeJson) {
      if (user?.name) employeeJson.name = user.name;

      const { skill_ids, skills } = await getEmployeeSelectedSkills(employee.id);
      employeeJson.skill_ids = skill_ids;
      employeeJson.selected_skills = skills;
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Personal info saved successfully',
      data: {
        employee: employeeJson,
      },
    });
  } catch (error) {
    console.error('[app/employees/:id/personal-info:save]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to save personal info', data: null });
  }
}

async function getPersonalInfo(req, res) {
  try {
    const { employee: resolved } = await resolveEmployeeFromParam(req.params?.id, { createIfMissing: false, lookupBy: 'user_id' });
    if (!resolved) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee/user id is required', data: null });
    }

    const employee = await Employee.findByPk(resolved.id, { include: buildEmployeeInclude() });
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    const employeeJson = employee.toJSON ? employee.toJSON() : employee;

    const user = await User.findByPk(employee.user_id, { attributes: ['id', 'name'] });
    if (user?.name) employeeJson.name = user.name;

    const { skill_ids, skills } = await getEmployeeSelectedSkills(employee.id);
    employeeJson.skill_ids = skill_ids;
    employeeJson.selected_skills = skills;

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Personal info fetched successfully',
      data: employeeJson,
    });
  } catch (error) {
    console.error('[app/employees/:id/personal-info:get]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to fetch personal info', data: null });
  }
}

async function saveEmployeeJobProfiles(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    const jobProfileIdsRaw = req.body?.job_profile_ids;
    const single = req.body?.job_profile_id;

    const jobProfileIds = Array.isArray(jobProfileIdsRaw)
      ? jobProfileIdsRaw.map(toInt).filter(Boolean)
      : (single ? [toInt(single)].filter(Boolean) : []);

    if (!jobProfileIds.length) {
      return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'job_profile_id or job_profile_ids is required', data: null });
    }

    await EmployeeJobProfile.destroy({ where: { employee_id: employeeId }, force: true });
    await EmployeeJobProfile.bulkCreate(
      jobProfileIds.map((job_profile_id) => ({ employee_id: employeeId, job_profile_id })),
      { ignoreDuplicates: true },
    );

    const rows = await EmployeeJobProfile.findAll({ where: { employee_id: employeeId } });
    const ids = rows.map((r) => r.job_profile_id);
    const profiles = ids.length
      ? await JobProfile.findAll({ where: { id: ids }, order: [["sequence", "ASC"], ["id", "ASC"]] })
      : [];

    const profilesJson = (profiles || []).map((q) => (q.toJSON ? q.toJSON() : q));
    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee job profiles saved successfully',
      data: profilesJson,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/job-profiles:save]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'Failed to save employee job profiles', data: null });
  }
}

async function getEmployeeJobProfiles(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employee id is required", data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Employee not found", data: null });
    }

    const rows = await EmployeeJobProfile.findAll({ where: { employee_id: employeeId } });
    const ids = rows.map((r) => r.job_profile_id);

    const profiles = ids.length
      ? await JobProfile.findAll({ where: { id: ids }, order: [["sequence", "ASC"], ["id", "ASC"]] })
      : [];

    const profilesJson = (profiles || []).map((q) => (q.toJSON ? q.toJSON() : q));

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Employee job profiles fetched successfully",
      data: profilesJson,
    });
  } catch (error) {
    console.error("[app/employees/:employeeId/job-profiles:get]", error);
    return sendApiResponse(res, { ok: false, code: "FC_03", message: "Failed to fetch employee job profiles", data: null });
  }
}

async function saveEmployeeExperience(req, res) {
  const experienceId = toInt(req.params?.experienceId) || toInt(req.body?.experience_id) || toInt(req.body?.id);
  if (experienceId) {
    req.params.experienceId = experienceId;
    return updateEmployeeExperience(req, res);
  }
  return createEmployeeExperience(req, res);
}

async function createEmployeeExperience(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    const file = pickFirstUploadedFile(req, ['selfie', 'image', 'file', 'document', 'document_file', 'certificate', 'experience_certificate']);
    const experience_certificate = file?.relativePath || null;

    const experience = await EmployeeExperience.create({
      user_id: employeeId,
      document_type_id: toInt(req.body?.document_type_id),
      work_nature_id: toInt(req.body?.work_nature_id),
      previous_firm: req.body?.previous_firm ?? null,
      work_duration: toDecimalOrNull(req.body?.work_duration),
      work_duration_frequency: req.body?.work_duration_frequency ?? null,
      experience_certificate,
    });

    const currentStatus = String(employee.verification_status || '').trim().toLowerCase();
    if (currentStatus !== 'init') {
      await employee.update({ verification_status: 'pending', verification_at: null });
    }

    const full = await EmployeeExperience.findByPk(experience.id, {
      include: [{ model: WorkNature, as: 'WorkNature', attributes: ['id', 'nature_english', 'nature_hindi', 'sequence'] }],
    });

    let payload = full ? (full.toJSON ? full.toJSON() : full) : (experience.toJSON ? experience.toJSON() : experience);
    payload = await attachExperienceMeta(payload);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee experience created successfully',
      data: payload,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/experiences:create]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to create employee experience', data: null });
  }
}

async function getEmployeeExperienceById(req, res) {
  try {
    const experienceId = toInt(req.params?.experienceId);
    if (!experienceId || experienceId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid experience id is required', data: null });
    }

    const experience = await EmployeeExperience.findByPk(experienceId, {
      include: [{ model: WorkNature, as: 'WorkNature', attributes: ['id', 'nature_english', 'nature_hindi', 'sequence'] }],
    });

    if (!experience) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee experience not found', data: null });
    }

    let payload = experience.toJSON ? experience.toJSON() : experience;
    payload = await attachExperienceMeta(payload);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee experience fetched successfully',
      data: payload,
    });
  } catch (error) {
    console.error('[app/employees/experiences/:experienceId:get]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to fetch employee experience', data: null });
  }
}

async function getEmployeeExperiencesByEmployeeId(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const experiences = await EmployeeExperience.findAll({
      where: { user_id: employeeId },
      order: [['id', 'DESC']],
      include: [{ model: WorkNature, as: 'WorkNature', attributes: ['id', 'nature_english', 'nature_hindi', 'sequence'] }],
    });

    const payloads = (experiences || []).map((e) => (e.toJSON ? e.toJSON() : e));

    const docTypeIds = Array.from(new Set(payloads.map((p) => p.document_type_id).filter(Boolean)));
    const docTypes = docTypeIds.length
      ? await DocumentType.findAll({
        where: { id: docTypeIds },
        attributes: ['id', 'type_english', 'type_hindi', 'sequence'],
        order: [['sequence', 'ASC'], ['id', 'ASC']],
      })
      : [];

    const docTypeMap = new Map((docTypes || []).map((d) => {
      const json = d.toJSON ? d.toJSON() : d;
      return [json.id, json];
    }));

    for (const p of payloads) {
      p.DocumentType = p.document_type_id ? (docTypeMap.get(p.document_type_id) || null) : null;
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee experiences fetched successfully',
      data: payloads,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/experiences:get-all]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Failed to fetch employee experiences', data: null });
  }
}

async function updateEmployeeExperience(req, res) {
  try {
    const experienceId = toInt(req.params?.experienceId);
    if (!experienceId || experienceId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid experience id is required', data: null });
    }

    const experience = await EmployeeExperience.findByPk(experienceId);
    if (!experience) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee experience not found', data: null });
    }

    const file = pickFirstUploadedFile(req, ['selfie', 'image', 'file', 'document', 'document_file', 'certificate', 'experience_certificate']);
    const experience_certificate = file?.relativePath || undefined;

    const newDocumentTypeId = req.body?.document_type_id !== undefined ? toInt(req.body.document_type_id) : experience.document_type_id;
    const newPreviousFirm = req.body?.previous_firm !== undefined ? (req.body.previous_firm ?? null) : experience.previous_firm;

    const firmChanged = newPreviousFirm !== experience.previous_firm;
    const documentChanged = newDocumentTypeId !== experience.document_type_id;

    await experience.update({
      document_type_id: newDocumentTypeId,
      work_nature_id: req.body?.work_nature_id !== undefined ? toInt(req.body.work_nature_id) : experience.work_nature_id,
      previous_firm: newPreviousFirm,
      work_duration: req.body?.work_duration !== undefined ? toDecimalOrNull(req.body.work_duration) : experience.work_duration,
      work_duration_frequency: req.body?.work_duration_frequency !== undefined ? (req.body.work_duration_frequency ?? null) : experience.work_duration_frequency,
      experience_certificate: experience_certificate !== undefined ? experience_certificate : experience.experience_certificate,
    });

    if (firmChanged || documentChanged) {
      const emp = await Employee.findByPk(experience.user_id);
      if (emp) {
        const currentStatus = String(emp.verification_status || '').trim().toLowerCase();
        if (currentStatus !== 'init') {
          await emp.update({ verification_status: 'pending', verification_at: null });
        }
      }
    }

    const full = await EmployeeExperience.findByPk(experience.id, {
      include: [{ model: WorkNature, as: 'WorkNature', attributes: ['id', 'nature_english', 'nature_hindi', 'sequence'] }],
    });

    let payload = full ? (full.toJSON ? full.toJSON() : full) : (experience.toJSON ? experience.toJSON() : experience);
    payload = await attachExperienceMeta(payload);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee experience updated successfully',
      data: payload,
    });
  } catch (error) {
    console.error('[app/employees/experiences/:experienceId:update]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to update employee experience', data: null });
  }
}

async function deleteEmployeeExperience(req, res) {
  try {
    const experienceId = toInt(req.params?.experienceId);
    if (!experienceId || experienceId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid experience id is required', data: null });
    }

    const experience = await EmployeeExperience.findByPk(experienceId);
    if (!experience) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee experience not found', data: null });
    }

    await experience.destroy();

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee experience deleted successfully',
      data: { id: experienceId },
    });
  } catch (error) {
    console.error('[app/employees/experiences/:experienceId:delete]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to delete employee experience', data: null });
  }
}

async function saveEmployeeDocument(req, res) {
  const documentId = toInt(req.params?.documentId) || toInt(req.body?.document_id) || toInt(req.body?.id);
  if (documentId) {
    req.params.documentId = documentId;
    return updateEmployeeDocument(req, res);
  }
  return createEmployeeDocument(req, res);
}

async function createEmployeeDocument(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    const file = pickFirstUploadedFile(req, ['selfie', 'image', 'file', 'document', 'document_file', 'certificate', 'experience_certificate']);
    if (!file?.relativePath) {
      return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Document file is required', data: null });
    }

    const documentTypeRaw = (req.body?.document_type !== undefined && req.body?.document_type !== null && req.body?.document_type !== '')
      ? req.body.document_type
      : req.body?.document_type_id;

    const document_type = (documentTypeRaw !== undefined && documentTypeRaw !== null && String(documentTypeRaw).trim() !== '')
      ? String(documentTypeRaw)
      : null;

    if (!document_type) {
      return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'document_type or document_type_id is required', data: null });
    }

    const additionalDocumentTypeId = toInt(document_type);
    if (!additionalDocumentTypeId) {
      return sendApiResponse(res, { ok: false, code: 'FC_05', message: 'Valid additional document type is required', data: null });
    }

    const additionalDocumentType = await AdditionalDocumentType.findByPk(additionalDocumentTypeId, {
      attributes: ['id', 'is_active'],
    });
    if (!additionalDocumentType || additionalDocumentType.is_active === false) {
      return sendApiResponse(res, { ok: false, code: 'FC_06', message: 'Additional document type not found', data: null });
    }

    const doc = await EmployeeDocument.create({
      user_id: employeeId,
      document_type: String(additionalDocumentTypeId),
      document_name: file.originalname,
      document_size: file.size || 0,
      document_link: file.relativePath,
    });

    if (String(employee.kyc_status || '').toLowerCase() === 'rejected') {
      await employee.update({ kyc_status: 'pending', kyc_verification_at: null });
    }

    const currentVerification = String(employee.verification_status || '').trim().toLowerCase();
    if (currentVerification !== 'init') {
      await employee.update({ verification_status: 'pending', verification_at: null });
    }

    let payload = doc.toJSON ? doc.toJSON() : doc;
    payload = await attachEmployeeDocumentType(payload);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee document uploaded successfully',
      data: payload,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/documents:create]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_07', message: 'Failed to upload employee document', data: null });
  }
}

async function getEmployeeDocumentsByEmployeeId(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const documents = await EmployeeDocument.findAll({ where: { user_id: employeeId }, order: [['id', 'DESC']] });
    const payloads = (documents || []).map((d) => (d.toJSON ? d.toJSON() : d));

    const docTypeIds = Array.from(new Set(payloads.map((p) => toInt(p.document_type)).filter(Boolean)));
    const docTypes = docTypeIds.length
      ? await AdditionalDocumentType.findAll({
        where: { id: docTypeIds },
        attributes: ['id', 'type_english', 'type_hindi', 'sequence'],
        order: [['sequence', 'ASC'], ['id', 'ASC']],
      })
      : [];

    const docTypeMap = new Map((docTypes || []).map((d) => {
      const json = d.toJSON ? d.toJSON() : d;
      return [json.id, json];
    }));

    for (const p of payloads) {
      const dtId = toInt(p.document_type);
      p.DocumentType = dtId ? (docTypeMap.get(dtId) || null) : null;
      p.AdditionalDocumentType = p.DocumentType;
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee documents fetched successfully',
      data: payloads,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/documents:get-all]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Failed to fetch employee documents', data: null });
  }
}

async function getEmployeeDocumentById(req, res) {
  try {
    const documentId = toInt(req.params?.documentId);
    if (!documentId || documentId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid document id is required', data: null });
    }

    const doc = await EmployeeDocument.findByPk(documentId);
    if (!doc) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee document not found', data: null });
    }

    let payload = doc.toJSON ? doc.toJSON() : doc;
    payload = await attachEmployeeDocumentType(payload);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee document fetched successfully',
      data: payload,
    });
  } catch (error) {
    console.error('[app/employees/documents/:documentId:get]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to fetch employee document', data: null });
  }
}

async function updateEmployeeDocument(req, res) {
  try {
    const documentId = toInt(req.params?.documentId);
    if (!documentId || documentId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid document id is required', data: null });
    }

    const doc = await EmployeeDocument.findByPk(documentId);
    if (!doc) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee document not found', data: null });
    }

    const file = pickFirstUploadedFile(req, ['selfie', 'image', 'file', 'document', 'document_file', 'certificate', 'experience_certificate']);

    let nextType = doc.document_type;
    if (req.body?.document_type !== undefined) nextType = String(req.body.document_type);
    else if (req.body?.document_type_id !== undefined) nextType = String(req.body.document_type_id);

    if (req.body?.document_type !== undefined || req.body?.document_type_id !== undefined) {
      const nextTypeId = toInt(nextType);
      if (!nextTypeId) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Valid additional document type is required', data: null });
      }
      const additionalDocumentType = await AdditionalDocumentType.findByPk(nextTypeId, {
        attributes: ['id', 'is_active'],
      });
      if (!additionalDocumentType || additionalDocumentType.is_active === false) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'Additional document type not found', data: null });
      }
      nextType = String(nextTypeId);
    }

    const nextName = file ? file.originalname : doc.document_name;
    const nextSize = file ? (file.size || 0) : doc.document_size;
    const nextLink = file?.relativePath ? file.relativePath : doc.document_link;

    await doc.update({
      document_type: nextType,
      document_name: nextName,
      document_size: nextSize,
      document_link: nextLink,
    });

    const employee = await Employee.findByPk(doc.user_id, { attributes: ['id', 'kyc_status', 'verification_status'] });
    if (employee && String(employee.kyc_status || '').toLowerCase() === 'rejected') {
      await employee.update({ kyc_status: 'pending', kyc_verification_at: null });
    }
    if (employee) {
      const currentVerification = String(employee.verification_status || '').trim().toLowerCase();
      if (currentVerification !== 'init') {
        await employee.update({ verification_status: 'pending', verification_at: null });
      }
    }

    let payload = doc.toJSON ? doc.toJSON() : doc;
    payload = await attachEmployeeDocumentType(payload);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee document updated successfully',
      data: payload,
    });
  } catch (error) {
    console.error('[app/employees/documents/:documentId:update]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to update employee document', data: null });
  }
}

async function deleteEmployeeDocument(req, res) {
  try {
    const documentId = toInt(req.params?.documentId);
    if (!documentId || documentId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid document id is required', data: null });
    }

    const doc = await EmployeeDocument.findByPk(documentId);
    if (!doc) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee document not found', data: null });
    }

    await doc.destroy();

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Employee document deleted successfully',
      data: { id: documentId },
    });
  } catch (error) {
    console.error('[app/employees/documents/:documentId:delete]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Failed to delete employee document', data: null });
  }
}

async function sendAadharOtp(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    const mobileRaw = req.body?.mobile;
    const hasMobile = mobileRaw !== undefined && mobileRaw !== null && String(mobileRaw).trim() !== '';
    const mobile = hasMobile ? normalizeIndianMobile10(mobileRaw) : '';

    // Mobile change OTP flow
    if (hasMobile) {
      if (!employeeId || employeeId <= 0) {
        return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
      }
      if (!mobile || mobile.length !== 10) {
        return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Valid mobile number is required', data: null });
      }

      const employee = await Employee.findByPk(employeeId, { attributes: ['id', 'user_id'] });
      if (!employee) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Employee not found', data: null });
      }

      const user = await User.findByPk(employee.user_id);
      if (!user) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'User not found', data: null });
      }

      if (String(user.mobile || '').trim() === mobile) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'New mobile cannot be same as current mobile', data: null });
      }

      const existing = await User.findOne({ where: { mobile } });
      if (existing && existing.id !== user.id) {
        return sendApiResponse(res, { ok: false, code: 'FC_05', message: 'Mobile number already in use', data: null });
      }

      const { sessionId } = await sendTwoFactorOtp(mobile);
      await user.update({
        mobile_change_pending: mobile,
        mobile_change_otp_session_id: sessionId,
        mobile_change_otp_created_at: new Date(),
      });

      const includeSessionId = isTruthyEnv(process.env.DEBUG_OTP);

      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: 'OTP sent successfully',
        data: includeSessionId ? { mobile, session_id: sessionId, sessionId } : { mobile },
      });
    }

    // Aadhaar KYC OTP flow
    const aadhar_number = String(req.body?.aadhar_number || '').replace(/\s+/g, '');

    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }
    if (!aadhar_number) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'aadhar_number is required', data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Employee not found', data: null });
    }

    const { requestId } = await generateAadhaarOtp(aadhar_number);
    await employee.update({
      aadhar_number_pending: aadhar_number,
      aadhar_request_id: requestId,
      aadhar_otp: null,
      aadhar_otp_created_at: new Date(),
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Aadhaar OTP sent successfully',
      data: { employee_id: employeeId },
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/aadhar/send-otp]', error);
    const includeError = isTruthyEnv(process.env.DEBUG_OTP);
    const details = String(error?.message || error || '').trim();
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_04',
      message: 'Failed to send Aadhaar OTP',
      data: includeError ? { error: details || 'Unknown error' } : null,
    });
  }
}

async function verifyAadharOtp(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    const mobileRaw = req.body?.mobile;
    const hasMobile = mobileRaw !== undefined && mobileRaw !== null && String(mobileRaw).trim() !== '';
    const mobile = hasMobile ? normalizeIndianMobile10(mobileRaw) : '';
    const otp = String(req.body?.otp || '').trim();

    // Mobile change verification
    if (hasMobile) {
      if (!employeeId || employeeId <= 0) {
        return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
      }
      if (!mobile || mobile.length !== 10 || !otp) {
        return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'mobile and otp are required', data: null });
      }

      const employee = await Employee.findByPk(employeeId, { attributes: ['id', 'user_id'] });
      if (!employee) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Employee not found', data: null });
      }

      const user = await User.findByPk(employee.user_id);
      if (!user) {
        return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'User not found', data: null });
      }

      const pendingMobile = String(user.mobile_change_pending || '').trim();
      if (!pendingMobile || pendingMobile !== mobile) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'OTP not requested for this mobile. Please request OTP again.', data: null });
      }

      const sessionId = String(user.mobile_change_otp_session_id || '').trim();
      if (!sessionId) {
        return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'OTP session not found. Please request OTP again.', data: null });
      }

      const verification = await verifyTwoFactorOtp(sessionId, otp);
      if (!verification.matched) {
        return sendApiResponse(res, { ok: false, code: 'FC_05', message: verification.details || 'Invalid OTP', data: null });
      }

      const existing = await User.findOne({ where: { mobile } });
      if (existing && existing.id !== user.id) {
        return sendApiResponse(res, { ok: false, code: 'FC_06', message: 'Mobile number already in use', data: null });
      }

      const now = new Date();
      try {
        await user.update({
          mobile,
          phone_verified_at: now,
          last_active_at: now,
          mobile_change_pending: null,
          mobile_change_otp_session_id: null,
          mobile_change_otp_created_at: null,
        });
      } catch (e) {
        if (e && e.name === 'SequelizeUniqueConstraintError') {
          return sendApiResponse(res, { ok: false, code: 'FC_06', message: 'Mobile number already in use', data: null });
        }
        throw e;
      }

      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: 'Mobile number updated successfully',
        data: { mobile },
      });
    }

    // Aadhaar KYC OTP flow
    const aadhar_number = String(req.body?.aadhar_number || '').replace(/\s+/g, '');

    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }
    if (!aadhar_number || !otp) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'aadhar_number and otp are required', data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Employee not found', data: null });
    }

    if (!employee.aadhar_number_pending || employee.aadhar_number_pending !== aadhar_number) {
      return sendApiResponse(res, { ok: false, code: 'FC_05', message: 'Aadhaar number mismatch', data: null });
    }

    if (!employee.aadhar_request_id) {
      return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'Aadhaar OTP request not found. Please request OTP again.', data: null });
    }

    const verification = await verifyAadhaarOtpApi(employee.aadhar_request_id, otp);
    if (!verification.matched) {
      return sendApiResponse(res, { ok: false, code: 'FC_04', message: verification.details || 'Invalid OTP', data: null });
    }

    if (!namesMatch(employee.name, verification.fullName)) {
      return sendApiResponse(res, { ok: false, code: 'FC_07', message: 'Name on Aadhaar does not match your profile name', data: null });
    }

    if (verification.dob && !dobsMatch(employee.dob, verification.dob)) {
      return sendApiResponse(res, { ok: false, code: 'FC_08', message: 'Date of birth on Aadhaar does not match your profile. Please update your date of birth to match your Aadhaar card.', data: null });
    }

    const updatePayload = {
      aadhar_number: maskAadhar(aadhar_number),
      aadhar_verified_at: employee.aadhar_verified_at || new Date(),
      aadhar_number_pending: null,
      aadhar_request_id: null,
      aadhar_otp: null,
      aadhar_otp_created_at: null,
    };

    await employee.update(updatePayload);

    await maybeVerifyKyc(employee);

    const updated = await Employee.findByPk(employee.id, { include: buildEmployeeInclude() });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Aadhaar verified successfully',
      data: updated ? (updated.toJSON ? updated.toJSON() : updated) : null,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/aadhar/verify-otp]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_06', message: 'Failed to verify Aadhaar OTP', data: null });
  }
}

async function uploadSelfie(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Valid employee id is required', data: null });
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_02', message: 'Employee not found', data: null });
    }

    const file = pickFirstUploadedFile(req, ['selfie', 'image', 'file', 'document', 'document_file', 'certificate', 'experience_certificate']);
    if (!file?.relativePath) {
      return sendApiResponse(res, { ok: false, code: 'FC_03', message: 'Selfie image is required', data: null });
    }

    const updatePayload = { selfie_link: file.relativePath };

    await employee.update(updatePayload);

    await maybeVerifyKyc(employee);

    const updated = await Employee.findByPk(employee.id, { include: buildEmployeeInclude() });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Selfie uploaded successfully',
      data: updated ? (updated.toJSON ? updated.toJSON() : updated) : null,
    });
  } catch (error) {
    console.error('[app/employees/:employeeId/selfie]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'Failed to upload selfie', data: null });
  }
}

async function saveDob(req, res) {
  try {
    const { employee } = await resolveEmployeeFromParam(req.params?.employeeId, { createIfMissing: false, lookupBy: 'employee_id' });
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: 'FC_01', message: 'Employee not found', data: null });
    }

    const rawDob = (req.body?.dob ?? '').toString().trim();
    const dob = normalizeDateOnlyOrNull(rawDob);
    if (!dob) {
      return sendApiResponse(res, { ok: false, code: 'VALIDATION_ERROR', message: 'Date of birth is required', data: null });
    }
    if (!isAtLeast18YearsOld(dob)) {
      return sendApiResponse(res, { ok: false, code: 'VALIDATION_ERROR', message: 'You must be at least 18 years old', data: null });
    }

    await employee.update({ dob });

    return sendApiResponse(res, { ok: true, code: 'OK', message: 'Date of birth saved', data: { dob } });
  } catch (error) {
    console.error('[app/employees/:employeeId/dob]', error);
    return sendApiResponse(res, { ok: false, code: 'FC_04', message: 'Failed to save date of birth', data: null });
  }
}

module.exports = {
  saveEmployeeDocument,

  saveEmployeeExperience,

  getEmployeeById,

  savePersonalInfo,
  getPersonalInfo,

  saveDob,

  saveEmployeeJobProfiles,
  getEmployeeJobProfiles,

  createEmployeeExperience,
  getEmployeeExperienceById,
  getEmployeeExperiencesByEmployeeId,
  updateEmployeeExperience,
  deleteEmployeeExperience,

  createEmployeeDocument,
  getEmployeeDocumentsByEmployeeId,
  getEmployeeDocumentById,
  updateEmployeeDocument,
  deleteEmployeeDocument,

  sendAadharOtp,
  verifyAadharOtp,
  uploadSelfie,
  submitEmployeeProfileForReview,
};
