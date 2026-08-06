const { sendApiResponse, getRequestOrigin } = require("../_helpers/response");

const Sequelize = require("sequelize");
const { Op } = Sequelize;

const crypto = require("crypto");
const { sequelize } = require("../../config/db");

const {
  Job,
  Employer,
  Employee,
  EmployerShortlistedCandidate,
  JobGender,
  JobQualification,
  State,
  City,
  Qualification,
  User,
  EmployeeJobProfile,
  JobProfile,
  JobInterest,
  SalaryType,
  Shift,
} = require("../../models");

const EmployeeExperience = require("../../models/EmployeeExperience");
const EmployeeSkill = require("../../models/EmployeeSkill");
const SalaryRange = require("../../models/SalaryRange");
const EmployerContact = require("../../models/EmployerContact");
const Report = require("../../models/Report");
const EmployeeReportReason = require("../../models/EmployeeReportReason");
const CallHistory = require("../../models/CallHistory");
const EmployerCallExperience = require("../../models/EmployerCallExperience");
const SkillModel = require("../../models/Skill");
const { fillBilingualPair } = require('../../utils/bilingual');
const { notifyUser } = require('../../utils/userNotifications');
const { sendToUser } = require('../../utils/systemNotifications');

const SUCCESS_CODE = "SC_01";

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function buildCandidateShareLink(req, slug) {
  const s = String(slug || '').trim();
  if (!s) return null;

  const origin = stripTrailingSlash(getRequestOrigin(req));
  if (!origin) return null;

  return `${origin}/app/candidates/${encodeURIComponent(s)}`;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

async function getJobProfileLabelsById(jobId) {
  const job = await Job.findByPk(jobId, {
    attributes: ['id'],
    include: [{
      model: JobProfile,
      as: 'JobProfile',
      attributes: ['profile_english', 'profile_hindi'],
      required: false,
    }],
    paranoid: false,
  });

  return {
    english: job?.JobProfile?.profile_english || job?.JobProfile?.profile_hindi || 'job',
    hindi: job?.JobProfile?.profile_hindi || job?.JobProfile?.profile_english || 'जॉब',
  };
}

function toFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getCandidateSelectedSkills(employeeId) {
  const rows = await EmployeeSkill.findAll({
    where: { user_id: employeeId },
    attributes: ['skill_id'],
    order: [['id', 'ASC']],
  });

  const skillIds = (rows || []).map((row) => row.skill_id).filter(Boolean);
  if (!skillIds.length) {
    return [];
  }

  const skillsRows = await SkillModel.findAll({
    where: { id: skillIds },
    attributes: ['id', 'skill_english', 'skill_hindi', 'sequence'],
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });

  return (skillsRows || []).map((skill) => (skill?.toJSON ? skill.toJSON() : skill));
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getEmployerShortlistLookup(employerId, employeeIds) {
  const id = toInt(employerId);
  const normalizedEmployeeIds = Array.from(
    new Set((Array.isArray(employeeIds) ? employeeIds : [])
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0))
  );

  if (!id || id <= 0 || !normalizedEmployeeIds.length) return new Map();

  const rows = await EmployerShortlistedCandidate.findAll({
    where: {
      employer_id: id,
      employee_id: { [Op.in]: normalizedEmployeeIds },
    },
    attributes: ["id", "employee_id", "created_at", "updated_at"],
    paranoid: false,
  });

  return new Map(
    (rows || []).map((row) => {
      const plain = row?.toJSON ? row.toJSON() : row;
      return [plain.employee_id, plain];
    })
  );
}

function buildShortlistPayload(shortlistRow) {
  const raw = shortlistRow && shortlistRow.toJSON ? shortlistRow.toJSON() : shortlistRow;
  const isShortlisted = Boolean(raw);
  const shortlistedAt = isShortlisted
    ? (raw.updated_at || raw.created_at || null)
    : null;

  return {
    is_shortlisted: isShortlisted,
    shortlisted_at: shortlistedAt,
    shortlist_id: isShortlisted ? (raw.id || null) : null,
  };
}

function parseIdList(value) {
  if (value === null || value === undefined || value === "") return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  for (const v of raw) {
    if (v === null || v === undefined) continue;
    const parts = typeof v === "string" ? v.split(",") : [String(v)];
    for (const partRaw of parts) {
      const part = String(partRaw || "").trim();
      if (!part) continue;
      const n = Number(part);
      if (Number.isInteger(n) && n > 0) out.push(n);
    }
  }
  return Array.from(new Set(out));
}

function parseRangeList(value) {
  if (value === null || value === undefined || value === "") return [];

  const push = (ranges, minVal, maxVal) => {
    if (minVal === null && maxVal === null) return;
    ranges.push({ min: minVal, max: maxVal });
  };

  const ranges = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        push(ranges, toFloat(item.min), toFloat(item.max));
      }
    }
    return ranges;
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && typeof item === "object") {
          push(ranges, toFloat(item.min), toFloat(item.max));
        }
      }
      return ranges;
    } catch (_e) {
      // fall through
    }
  }

  const parts = text.split(",").map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf("-");
    if (idx >= 0) {
      const a = part.slice(0, idx).trim();
      const b = part.slice(idx + 1).trim();
      push(ranges, toFloat(a), toFloat(b));
    } else {
      const n = toFloat(part);
      push(ranges, n, n);
    }
  }

  return ranges;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (g === "male" || g === "female" || g === "any") return g;
  return null;
}

function normalizeSalaryFrequency(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "month" || v === "monthly") return "month";
  if (v === "day" || v === "daily") return "day";
  return null;
}

async function getCandidateIdBySlug(req, res) {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid candidate slug is required',
        data: null,
      });
    }

    const candidate = await Employee.findOne({
      where: { slug },
      attributes: ['id', 'slug'],
    });

    if (!candidate) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'Candidate not found',
        data: null,
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Success',
      data: { id: candidate.id, slug: candidate.slug },
    });
  } catch (error) {
    console.error('[app/candidates/slug]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_99',
      message: error.message || 'Failed to resolve candidate',
      data: null,
    });
  }
}


function generateOtp(length = 4) {
  const len = Number(length) || 4;
  const max = 10 ** len;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(len, "0");
}

async function getRecommendedCandidates(req, res) {
  try {
    const input = (req.method === "POST" && req.body && Object.keys(req.body).length)
      ? req.body
      : (req.query || {});
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const search = String(input?.search || "").trim();
    const distanceRanges = parseRangeList(input?.distance_ranges);
    const experienceRanges = parseRangeList(input?.experience_ranges);

    const jobProfileIdsFilter = parseIdList(input?.job_profile_ids || input?.job_profile_id);
    const preferredStateIds = parseIdList(input?.preferred_state_ids || input?.state_ids);
    const preferredCityIdsFilter = parseIdList(input?.preferred_city_ids || input?.city_ids);
    const qualificationIds = parseIdList(input?.qualification_ids);
    const shiftIds = parseIdList(input?.shift_ids);
    const skillIds = parseIdList(input?.skill_ids);
    const salaryRangeIds = parseIdList(input?.salary_range_ids);

    const genderFilter = normalizeGender(input?.gender);
    const salaryFrequencyFilter = normalizeSalaryFrequency(
      input?.expected_salary_frequency || input?.expected_salary_freq || input?.salary_frequency
    );
    const verificationFilter = String(input?.verification_status || "").trim().toLowerCase();

    const page = Math.max(toInt(input?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(input?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    // Step 1: Fetch employer's active jobs — derive job profile IDs, city IDs, and origins for distance.
    const jobRows = await Job.findAll({
      where: {
        employer_id: employerId,
        status: "active",
        [Op.or]: [{ expired_at: { [Op.is]: null } }, { expired_at: { [Op.gt]: new Date() } }],
      },
      attributes: ["id", "job_profile_id", "job_city_id", "lat", "lng"],
      paranoid: false,
    });

    const activeJobs = (jobRows || []).map((j) => (j?.toJSON ? j.toJSON() : j));
    if (!activeJobs.length) {
      return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Recommended candidates fetched successfully", data: { page, limit, total: 0, candidates: [] } });
    }

    // Intersect job profile IDs with user filter if provided.
    let baseJobProfileIds = [...new Set(activeJobs.map((j) => toInt(j.job_profile_id)).filter((id) => id > 0))];
    if (jobProfileIdsFilter.length) {
      baseJobProfileIds = baseJobProfileIds.filter((id) => jobProfileIdsFilter.includes(id));
    }
    if (!baseJobProfileIds.length) {
      return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Recommended candidates fetched successfully", data: { page, limit, total: 0, candidates: [] } });
    }

    const jobCityIds = [...new Set(activeJobs.map((j) => toInt(j.job_city_id)).filter((id) => id > 0))];
    const jobOrigins = activeJobs
      .map((j) => ({ lat: toFloat(j.lat), lng: toFloat(j.lng) }))
      .filter((o) => o.lat !== null && o.lng !== null);

    // Step 2: Find employee IDs matching the job profiles.
    const ejpRows = await EmployeeJobProfile.findAll({
      where: { job_profile_id: { [Op.in]: baseJobProfileIds } },
      attributes: ["employee_id"],
      paranoid: true,
    });
    let restrictedEmployeeIds = new Set(
      ejpRows.map((r) => toInt(r.employee_id)).filter((id) => id > 0)
    );
    if (!restrictedEmployeeIds.size) {
      return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Recommended candidates fetched successfully", data: { page, limit, total: 0, candidates: [] } });
    }

    // Step 3: Apply experience and skill subquery filters — same as getAllCandidates.
    function intersectIds(current, incoming) {
      return new Set(incoming.filter((id) => current.has(id)));
    }

    if (experienceRanges.length) {
      const durationInYears = Sequelize.literal(
        `CASE WHEN work_duration_frequency = 'months' THEN work_duration / 12` +
        ` WHEN work_duration_frequency = 'days' THEN work_duration / 365` +
        ` ELSE work_duration END`
      );
      const orRanges = [];
      for (const r of experienceRanges) {
        const { min, max } = r;
        const parts = [];
        if (min !== null && min !== undefined) parts.push(Sequelize.where(durationInYears, { [Op.gte]: min }));
        if (max !== null && max !== undefined) parts.push(Sequelize.where(durationInYears, { [Op.lte]: max }));
        if (parts.length) orRanges.push(parts.length === 1 ? parts[0] : { [Op.and]: parts });
      }
      const expRows = await EmployeeExperience.findAll({
        attributes: ["user_id"],
        where: orRanges.length ? { [Op.or]: orRanges } : {},
        paranoid: true,
      });
      restrictedEmployeeIds = intersectIds(restrictedEmployeeIds, (expRows || []).map((r) => r.user_id).filter(Boolean));
    }

    if (skillIds.length) {
      const skillRows = await EmployeeSkill.findAll({
        attributes: ["user_id"],
        where: { skill_id: { [Op.in]: skillIds } },
        paranoid: false,
      });
      restrictedEmployeeIds = intersectIds(restrictedEmployeeIds, (skillRows || []).map((r) => r.user_id).filter(Boolean));
    }

    if (!restrictedEmployeeIds.size) {
      return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Recommended candidates fetched successfully", data: { page, limit, total: 0, candidates: [] } });
    }

    // Step 4: Build the main employee WHERE — same filter logic as getAllCandidates.
    const where = { id: { [Op.in]: Array.from(restrictedEmployeeIds) } };
    const and = [];

    // kyc_status filter — same logic as getAllCandidates.
    if (verificationFilter === "not_verified") {
      where.kyc_status = { [Op.notIn]: ["verified", "approved"] };
    } else if (verificationFilter) {
      where.kyc_status = { [Op.in]: ["verified", "approved"] };
    }

    // City: use employer's job cities as base; intersect with user's filter if provided.
    const effectiveCityIds = preferredCityIdsFilter.length
      ? jobCityIds.filter((id) => preferredCityIdsFilter.includes(id))
      : jobCityIds;
    if (effectiveCityIds.length) where.preferred_city_id = { [Op.in]: effectiveCityIds };

    if (preferredStateIds.length) where.preferred_state_id = { [Op.in]: preferredStateIds };
    if (qualificationIds.length) where.qualification_id = { [Op.in]: qualificationIds };
    if (shiftIds.length) where.preferred_shift_id = { [Op.in]: shiftIds };
    if (genderFilter && genderFilter !== "any") where.gender = genderFilter;
    if (salaryFrequencyFilter) where.expected_salary_frequency = salaryFrequencyFilter;

    // Search — SQL level, same as getAllCandidates.
    if (search) {
      const like = "%" + search.toLowerCase() + "%";
      const escapedLike = sequelize.escape(like);
      and.push({
        [Op.or]: [
          Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("Employee.name")), { [Op.like]: like }),
          Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("User.name")), { [Op.like]: like }),
          {
            id: {
              [Op.in]: Sequelize.literal(
                `(SELECT DISTINCT ejp.employee_id FROM employee_job_profiles ejp` +
                ` INNER JOIN job_profiles jp ON ejp.job_profile_id = jp.id` +
                ` WHERE ejp.deleted_at IS NULL` +
                ` AND (LOWER(jp.profile_english) LIKE ${escapedLike} OR LOWER(jp.profile_hindi) LIKE ${escapedLike}))`
              ),
            },
          },
        ],
      });
    }

    // Salary range filter — same as getAllCandidates.
    if (salaryRangeIds.length) {
      const ranges = await SalaryRange.findAll({
        attributes: ["id", "salary_from", "salary_to"],
        where: { id: { [Op.in]: salaryRangeIds } },
        paranoid: true,
      });
      if (ranges.length) {
        const orRanges = [];
        for (const r of ranges) {
          const from = toFloat(r.salary_from);
          const to = toFloat(r.salary_to);
          const parts = [];
          if (from !== null) parts.push({ expected_salary: { [Op.gte]: from } });
          if (to !== null) parts.push({ expected_salary: { [Op.lte]: to } });
          if (parts.length) orRanges.push({ [Op.and]: parts });
        }
        if (orRanges.length) and.push({ [Op.or]: orRanges });
      }
    }

    // Distance filter — LEAST(...) haversine, same as getAllCandidates.
    if (distanceRanges.length && jobOrigins.length) {
      and.push({ lat: { [Op.ne]: null }, lng: { [Op.ne]: null } });
      const distExprs = jobOrigins.map((origin) => {
        const oLat = Number(origin.lat);
        const oLng = Number(origin.lng);
        return (
          '6371 * ACOS(LEAST(1, GREATEST(-1,' +
          ' COS(RADIANS(' + oLat + '))' +
          ' * COS(RADIANS(`Employee`.`lat`))' +
          ' * COS(RADIANS(`Employee`.`lng`) - RADIANS(' + oLng + '))' +
          ' + SIN(RADIANS(' + oLat + ')) * SIN(RADIANS(`Employee`.`lat`))' +
          ')))'
        );
      });
      const minDistSql = distExprs.length === 1 ? distExprs[0] : `LEAST(${distExprs.join(', ')})`;
      const minDistExpr = Sequelize.literal(`(${minDistSql})`);
      const rangeConds = [];
      for (const r of distanceRanges) {
        const effectiveMin = r.min !== null && r.min !== undefined ? r.min : 0;
        const { max } = r;
        if (max != null) rangeConds.push(Sequelize.where(minDistExpr, { [Op.between]: [effectiveMin, max] }));
        else rangeConds.push(Sequelize.where(minDistExpr, { [Op.gte]: effectiveMin }));
      }
      if (rangeConds.length === 1) and.push(rangeConds[0]);
      else if (rangeConds.length > 1) and.push({ [Op.or]: rangeConds });
    }

    if (and.length) where[Op.and] = and;

    // Step 5: Fetch filtered employees with pagination.
    where.verification_status = 'verified';

    const employeeJobProfilesInclude = {
      model: EmployeeJobProfile,
      as: "EmployeeJobProfiles",
      attributes: ["employee_id", "job_profile_id"],
      required: false,
      paranoid: true,
      include: [{ model: JobProfile, as: "JobProfile", attributes: ["profile_english", "profile_hindi"], required: false }],
    };

    const { count, rows } = await Employee.findAndCountAll({
      where,
      attributes: [
        "id", "slug", "user_id", "name", "name_hindi", "gender",
        "preferred_state_id", "preferred_city_id", "qualification_id",
        "preferred_shift_id", "verification_status", "kyc_status",
        "expected_salary", "expected_salary_frequency", "selfie_link",
        "lat", "lng", "created_at",
      ],
      include: [
        { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
        { model: Qualification, as: "Qualification", attributes: ["qualification_english", "qualification_hindi"], required: false },
        { model: Shift, as: "Shift", attributes: ["shift_english"], required: false },
        {
          model: User,
          as: "User",
          attributes: ["id", "name", "name_hindi", "mobile", "is_active"],
          where: { is_active: true },
          required: true,
        },
        employeeJobProfilesInclude,
      ],
      distinct: true,
      order: [["id", "DESC"]],
      limit,
      offset,
    });

    const shortlistLookup = await getEmployerShortlistLookup(
      employerId,
      (rows || []).map((emp) => emp.id)
    );

    const candidates = (rows || []).map((emp) => {
      const jobProfiles = Array.isArray(emp.EmployeeJobProfiles)
        ? emp.EmployeeJobProfiles
            .filter((ejp) => !ejp.deleted_at && ejp.JobProfile)
            .map((ejp) => ({
              id: ejp.job_profile_id,
              profile_english: ejp.JobProfile.profile_english,
              profile_hindi: ejp.JobProfile.profile_hindi,
            }))
        : [];

      const shortlist = buildShortlistPayload(shortlistLookup.get(emp.id));

      let distance_km = null;
      if (jobOrigins.length && emp.lat != null && emp.lng != null) {
        const empLat = Number(emp.lat);
        const empLng = Number(emp.lng);
        if (Number.isFinite(empLat) && Number.isFinite(empLng)) {
          const distances = jobOrigins.map((o) => haversineKm(o.lat, o.lng, empLat, empLng));
          distance_km = Math.round(Math.min(...distances) * 10) / 10;
        }
      }

      return {
        id: emp.id,
        name: emp.name || emp.User?.name || null,
        name_english: emp.name || emp.User?.name || null,
        name_hindi: emp.name_hindi || emp.User?.name_hindi || null,
        mobile: emp.User?.mobile || null,
        is_active: emp.User?.is_active ?? null,
        gender: emp.gender || null,
        verification_status: emp.verification_status || null,
        kyc_status: emp.kyc_status || null,
        expected_salary: emp.expected_salary ?? null,
        expected_salary_frequency: emp.expected_salary_frequency || null,
        preferred_state: emp.PreferredState?.state_english || emp.PreferredState?.state_hindi || null,
        preferred_state_english: emp.PreferredState?.state_english || null,
        preferred_state_hindi: emp.PreferredState?.state_hindi || null,
        preferred_city: emp.PreferredCity?.city_english || emp.PreferredCity?.city_hindi || null,
        preferred_city_english: emp.PreferredCity?.city_english || null,
        preferred_city_hindi: emp.PreferredCity?.city_hindi || null,
        qualification: emp.Qualification?.qualification_english || emp.Qualification?.qualification_hindi || null,
        preferred_shift: emp.Shift?.shift_english || null,
        selfie_link: emp.kyc_status === 'verified' ? (emp.selfie_link || null) : null,
        job_profiles: jobProfiles,
        created_at: emp.created_at,
        distance_km,
        shortlist,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Recommended candidates fetched successfully",
      data: { page, limit, total: count || 0, candidates },
    });
  } catch (error) {
    console.error("[app/candidates/recommended/:employerId]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_03",
      message: error.message || "Failed to fetch recommended candidates",
      data: null,
    });
  }
}



async function getCandidateDetail(req, res) {
  try {
    const candidateId = toInt(req.params?.candidateId ?? req.params?.employeeId ?? req.query?.candidateId);
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);

    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid candidate id is required",
        data: null,
      });
    }
    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_02",
        message: "Valid employer id is required",
        data: null,
      });
    }

    const employer = await Employer.findByPk(employerId, {
      paranoid: false,
      attributes: [
        "id",
        "total_contact_credit",
        "contact_credit",
        "total_interest_credit",
        "interest_credit",
      ],
    });


    const employee = await Employee.findByPk(candidateId, {
      paranoid: false,
      attributes: [
        "id",
        "slug",
        "user_id",
        "name",
        "name_hindi",
        "about_user",
        "about_user_hindi",
        "dob",
        "gender",
        "aadhar_number",
        "state_id",
        "city_id",
        "preferred_state_id",
        "preferred_city_id",
        "qualification_id",
        "preferred_shift_id",
        "verification_status",
        "kyc_status",
        "expected_salary",
        "expected_salary_frequency",
        "selfie_link",
        "lat",
        "lng",
        "created_at",
      ],
      include: [
        { model: State, as: "State", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "City", attributes: ["city_english", "city_hindi"], required: false },
        { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
        { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
        { model: Qualification, as: "Qualification", attributes: ["qualification_english", "qualification_hindi"], required: false },
        { model: Shift, as: "Shift", attributes: ["shift_english", "shift_hindi"], required: false },
        {
          model: User,
          as: "User",
          attributes: ["id", "name", "name_hindi", "mobile", "is_active"],
          required: false,
          paranoid: false,
        },
        {
          model: EmployeeJobProfile,
          as: "EmployeeJobProfiles",
          attributes: ["employee_id", "job_profile_id"],
          required: false,
          include: [{ model: JobProfile, as: "JobProfile", attributes: ["profile_english", "profile_hindi", "profile_image"], required: false }],
          paranoid: true,
        },
      ],
    });

    if (!employee) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_03",
        message: "Candidate not found",
        data: null,
      });
    }

    const emp = employee?.toJSON ? employee.toJSON() : employee;

    const experiences = await EmployeeExperience.findAll({
      where: { user_id: candidateId },
      attributes: [
        "id",
        "user_id",
        "work_nature_id",
        "previous_firm",
        "work_duration",
        "work_duration_frequency",
        "experience_certificate",
        "created_at",
        "updated_at",
      ],
      include: [{ association: "WorkNature", attributes: ["id", "nature_english", "nature_hindi"], required: false }],
      order: [["created_at", "DESC"]],
      paranoid: false,
    });

    const selectedSkills = await getCandidateSelectedSkills(candidateId);

    const contactRow = await EmployerContact.findOne({
      where: { employer_id: employerId, employee_id: candidateId },
      attributes: ["id", "created_at", "deleted_at", "call_experience_id"],
      order: [["created_at", "DESC"]],
      paranoid: false,
    });

    const isContactUnlocked = Boolean(contactRow && !contactRow.deleted_at);
    const contactUnlockedAt = isContactUnlocked ? contactRow.created_at : null;
    const isCallExperienceShared = Boolean(
      contactRow && !contactRow.deleted_at && contactRow.call_experience_id
    );

    const reportRow = await Report.findOne({
      where: { user_id: employerId, report_id: candidateId, report_type: "employee" },
      attributes: ["id", "created_at"],
      order: [["created_at", "DESC"]],
      paranoid: true,
    });

    const isReported = Boolean(reportRow);
    const reportedAt = reportRow?.created_at || null;

    const shortlistRow = await EmployerShortlistedCandidate.findOne({
      where: {
        employer_id: employerId,
        employee_id: candidateId,
      },
      attributes: ["id", "created_at", "updated_at"],
      order: [["updated_at", "DESC"]],
      paranoid: false,
    });
    const shortlist = buildShortlistPayload(shortlistRow);

    const jobProfiles = Array.isArray(emp.EmployeeJobProfiles)
      ? emp.EmployeeJobProfiles
          .filter((ejp) => !ejp.deleted_at && ejp.JobProfile)
          .map((ejp) => ({
            id: ejp.job_profile_id,
            profile_english: ejp.JobProfile.profile_english || null,
            profile_hindi: ejp.JobProfile.profile_hindi || null,
            profile_image: ejp.JobProfile.profile_image || null,
          }))
      : [];

    // avoid leaking nested structures the app doesn’t need
    if (emp.User) {
      // keep as separate object
    }
    delete emp.EmployeeJobProfiles;

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Candidate detail fetched successfully",
      data: {
        employee: {
          id: emp.id,
          slug: emp.slug || null,
          share_link: buildCandidateShareLink(req, emp.slug),
          name: emp.name || emp.User?.name || null,
          name_english: emp.name || emp.User?.name || null,
          name_hindi: emp.name_hindi || emp.User?.name_hindi || null,
          about_user: emp.about_user || null,
          about_user_english: emp.about_user || null,
          about_user_hindi: emp.about_user_hindi || null,
          about_us_hindi: emp.about_user_hindi || null,
          mobile: emp.User?.mobile || null,
          email: emp.email || null,
          is_active: emp.User?.is_active ?? null,
          gender: emp.gender || null,
          dob: emp.dob || null,
          verification_status: emp.verification_status || null,
          kyc_status: emp.kyc_status || null,
          aadhar_number: emp.aadhar_number || null,
          expected_salary: emp.expected_salary ?? null,
          expected_salary_frequency: emp.expected_salary_frequency || null,
          selfie_link: emp.kyc_status === 'verified' ? (emp.selfie_link || null) : null,
          current_state: emp.State?.state_english || emp.State?.state_hindi || null,
          current_state_english: emp.State?.state_english || null,
          current_state_hindi: emp.State?.state_hindi || null,
          current_city: emp.City?.city_english || emp.City?.city_hindi || null,
          current_city_english: emp.City?.city_english || null,
          current_city_hindi: emp.City?.city_hindi || null,
          preferred_state: emp.PreferredState?.state_english || emp.PreferredState?.state_hindi || null,
          preferred_state_english: emp.PreferredState?.state_english || null,
          preferred_state_hindi: emp.PreferredState?.state_hindi || null,
          preferred_city: emp.PreferredCity?.city_english || emp.PreferredCity?.city_hindi || null,
          preferred_city_english: emp.PreferredCity?.city_english || null,
          preferred_city_hindi: emp.PreferredCity?.city_hindi || null,
          preferred_shift: emp.Shift?.shift_english || emp.Shift?.shift_hindi || null,
          preferred_shift_english: emp.Shift?.shift_english || null,
          preferred_shift_hindi: emp.Shift?.shift_hindi || null,
          qualification: emp.Qualification?.qualification_english || emp.Qualification?.qualification_hindi || null,
          qualification_english: emp.Qualification?.qualification_english || null,
          qualification_hindi: emp.Qualification?.qualification_hindi || null,
          selected_skills: selectedSkills,
          created_at: emp.created_at || null,
        },
        employee_job_profiles: jobProfiles,
        employee_experiences: (experiences || []).map((x) => (x?.toJSON ? x.toJSON() : x)),
        contact: {
          is_unlocked: isContactUnlocked,
          unlocked_at: contactUnlockedAt,
          employer_contact_id: contactRow?.id || null,
          is_call_experience_shared: isCallExperienceShared,
        },
        call_experience: {
          is_shared: isCallExperienceShared,
        },
        report: {
          is_reported: isReported,
          reported_at: reportedAt,
        },
        shortlist: {
          ...shortlist,
          jobs: [],
        },
        employer_credits: {
          contact: {
            total: toNumber(employer?.total_contact_credit, 0),
            available: toNumber(employer?.contact_credit, 0),
          },
          interest: {
            total: toNumber(employer?.total_interest_credit, 0),
            available: toNumber(employer?.interest_credit, 0),
          },
        },
      },
    });
  } catch (error) {
    console.error("[app/candidates/detail]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_04",
      message: error.message || "Failed to fetch candidate detail",
      data: null,
    });
  }
}

async function unlockCandidateContact(req, res) {
  try {
    const employerId = toInt(req.body?.employerId ?? req.params?.employerId ?? req.query?.employerId);
    const candidateId = toInt(req.body?.candidateId ?? req.body?.employeeId ?? req.params?.candidateId ?? req.query?.candidateId);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employer id is required",
        data: null,
      });
    }

    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_02",
        message: "Valid candidate id is required",
        data: null,
      });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const existing = await EmployerContact.findOne({
        where: { employer_id: employerId, employee_id: candidateId },
        order: [["created_at", "DESC"]],
        paranoid: false,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      // Already unlocked (not soft-deleted) -> no credit deduction
      if (existing && !existing.deleted_at) {
        return {
          ok: true,
          message: "Candidate contact already unlocked",
          data: {
            is_unlocked: true,
            unlocked_at: existing.created_at,
            employer_contact_id: existing.id,
            contact_credit_deducted: 0,
          },
        };
      }

      const employer = await Employer.findByPk(employerId, {
        paranoid: false,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!employer) {
        return { ok: false, code: "FC_04", message: "Employer not found" };
      }

      const expiryAtRaw = employer.credit_expiry_at ? new Date(employer.credit_expiry_at) : null;
      const expiryAt = expiryAtRaw && !Number.isNaN(expiryAtRaw.getTime()) ? expiryAtRaw : null;
      const creditsExpired = !expiryAt || expiryAt.getTime() <= Date.now();

      const contactCreditsRaw = employer.get?.("contact_credits");
      const contactCredits = Number.isFinite(Number(contactCreditsRaw))
        ? Number(contactCreditsRaw)
        : Number(employer.contact_credit || 0);

      if (creditsExpired) {
        return {
          ok: false,
          code: "NO_CONTACT_CREDIT",
          message: "Employer credits have expired",
          data: {
            contact_credit: contactCredits,
            contact_credits: contactCredits,
            credit_expiry_at: employer.credit_expiry_at,
          },
        };
      }

      if (!Number.isFinite(contactCredits) || contactCredits < 1) {
        return {
          ok: false,
          code: "NO_CONTACT_CREDIT",
          message: "No contact credit available",
          data: {
            contact_credit: Number.isFinite(contactCredits) ? contactCredits : 0,
            contact_credits: Number.isFinite(contactCredits) ? contactCredits : 0,
            credit_expiry_at: employer.credit_expiry_at,
          },
        };
      }

      const nextContactCredits = Math.max(contactCredits - 1, 0);
      const creditUpdatePayload = { contact_credit: nextContactCredits };
      if (employer.get?.("contact_credits") !== undefined) {
        creditUpdatePayload.contact_credits = nextContactCredits;
      }
      await employer.update(creditUpdatePayload, { transaction });

      if (existing && existing.deleted_at) {
        await existing.restore({ transaction });

        const restored = await EmployerContact.findByPk(existing.id, {
          paranoid: false,
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        return {
          ok: true,
          message: "Candidate contact unlocked successfully",
          data: {
            is_unlocked: true,
            unlocked_at: restored?.created_at || null,
            employer_contact_id: restored?.id || null,
            contact_credit_deducted: 1,
            remaining_contact_credit: nextContactCredits,
            remaining_contact_credits: nextContactCredits,
            credit_expiry_at: employer.credit_expiry_at || null,
          },
        };
      }

      const created = await EmployerContact.create(
        {
          employer_id: employerId,
          employee_id: candidateId,
        },
        { transaction },
      );

      return {
        ok: true,
        message: "Candidate contact unlocked successfully",
        data: {
          is_unlocked: true,
          unlocked_at: created.created_at,
          employer_contact_id: created.id,
          contact_credit_deducted: 1,
          remaining_contact_credit: nextContactCredits,
          remaining_contact_credits: nextContactCredits,
          credit_expiry_at: employer.credit_expiry_at || null,
        },
      };
    });

    if (!result?.ok) {
      return sendApiResponse(res, {
        ok: false,
        code: result?.code || "FC_03",
        message: result?.message || "Failed to unlock candidate contact",
        data: result?.data || null,
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("[app/candidates/unlock-contact]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_03",
      message: error.message || "Failed to unlock candidate contact",
      data: null,
    });
  }
}


function toPage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function toLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(200, Math.floor(n));
}

function buildJobInclude() {
  return [
    {
      model: Employer,
      as: "Employer",
      required: false,
      paranoid: false,
      attributes: ["id", "name", "organization_name"],
    },
    { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
    { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi", "profile_image"], required: false },
    { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
    { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
  ];
}

async function fetchLatestJobInterestsForEmployee(jobIds, employeeId) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) return new Map();

  const interests = await JobInterest.findAll({
    where: {
      job_id: { [Op.in]: jobIds },
      [Op.or]: [
        { sender_type: "employee", sender_id: employeeId },
        { sender_type: "employer", receiver_id: employeeId },
      ],
    },
    order: [["created_at", "DESC"]],
    paranoid: false,
  });

  const map = new Map();
  (interests || []).forEach((row) => {
    const i = row?.toJSON ? row.toJSON() : row;
    if (!i?.job_id) return;
    if (!map.has(i.job_id)) map.set(i.job_id, i);
  });

  return map;
}

async function getEmployerActiveJobsForShortlisting(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    const candidateId = toInt(req.params?.candidateId ?? req.params?.employeeId ?? req.query?.candidateId);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid candidate id is required", data: null });
    }

    const page = toPage(req.query?.page);
    const limit = toLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { rows, count } = await Job.findAndCountAll({
      where: {
        employer_id: employerId,
        status: { [Op.in]: ["active", "published", "open"] },
        [Op.or]: [{ expired_at: { [Op.is]: null } }, { expired_at: { [Op.gt]: new Date() } }],
      },
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "salary_type_id",
        "is_household",
        "description_english",
        "description_hindi",
        "no_vacancy",
        "hired_total",
        "salary_min",
        "salary_max",
        "work_start_time",
        "work_end_time",
        "status",
        "verification_status",
        "job_state_id",
        "job_city_id",
        "lat",
        "lng",
        "created_at",
        "updated_at",
        "expired_at",
      ],
      include: buildJobInclude(),
      order: [["id", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const jobs = (rows || []).map((j) => (j?.toJSON ? j.toJSON() : j));
    const jobIds = jobs.map((j) => j.id).filter(Boolean);

    const interestMap = await fetchLatestJobInterestsForEmployee(jobIds, candidateId);

    const results = jobs.map((job) => {
      const employer = job?.Employer || null;
      const organizationName = employer?.organization_name || employer?.name || null;
      const interest = interestMap.get(job.id) || null;

      const salaryTypeName =
        job?.SalaryType?.type_english ||
        job?.SalaryType?.type_hindi ||
        null;

      const profileName =
        job?.JobProfile?.profile_english ||
        job?.JobProfile?.profile_hindi ||
        null;

      if (job) {
        job.salary_type = salaryTypeName;
        job.job_profile = profileName;
      }

      if (job) delete job.Employer;

      const canShortlist = !interest || String(interest.status || "").toLowerCase() == "pending";

      return {
        job,
        organization_name: organizationName,
        can_shortlist: canShortlist,
        interest: interest
          ? {
              job_interest_id: interest.id || null,
              status: interest.status || null,
              time: interest.created_at || null,
            }
          : null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Active jobs fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/candidates/jobs/shortlist]", error);
    return sendApiResponse(res, { ok: false, code: "FC_03", message: error.message || "Failed to fetch active jobs", data: null });
  }
}

async function getEmployerJobsForSendingInterest(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    const candidateId = toInt(req.params?.candidateId ?? req.params?.employeeId ?? req.query?.candidateId);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid candidate id is required", data: null });
    }

    const page = toPage(req.query?.page);
    const limit = toLimit(req.query?.limit);
    const offset = (page - 1) * limit;

    const { rows, count } = await Job.findAndCountAll({
      where: {
        employer_id: employerId,
        status: { [Op.in]: ["active", "published", "open"] },
        [Op.or]: [{ expired_at: { [Op.is]: null } }, { expired_at: { [Op.gt]: new Date() } }],
      },
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "salary_type_id",
        "is_household",
        "description_english",
        "description_hindi",
        "no_vacancy",
        "hired_total",
        "salary_min",
        "salary_max",
        "work_start_time",
        "work_end_time",
        "status",
        "verification_status",
        "job_state_id",
        "job_city_id",
        "lat",
        "lng",
        "created_at",
        "updated_at",
        "expired_at",
      ],
      include: buildJobInclude(),
      order: [["id", "DESC"]],
      limit,
      offset,
      distinct: true,
      paranoid: false,
    });

    const jobs = (rows || []).map((j) => (j?.toJSON ? j.toJSON() : j));
    const jobIds = jobs.map((j) => j.id).filter(Boolean);

    const interestMap = await fetchLatestJobInterestsForEmployee(jobIds, candidateId);

    const results = jobs.map((job) => {
      const employer = job?.Employer || null;
      const organizationName = employer?.organization_name || employer?.name || null;
      const interest = interestMap.get(job.id) || null;

      const salaryTypeName =
        job?.SalaryType?.type_english ||
        job?.SalaryType?.type_hindi ||
        null;

      const profileName =
        job?.JobProfile?.profile_english ||
        job?.JobProfile?.profile_hindi ||
        null;

      if (job) {
        job.salary_type = salaryTypeName;
        job.job_profile = profileName;
      }

      if (job) delete job.Employer;

      const canSendInterest = !interest;

      return {
        job,
        organization_name: organizationName,
        can_send_interest: canSendInterest,
        interest: interest
          ? {
              job_interest_id: interest.id || null,
              status: interest.status || null,
              time: interest.created_at || null,
            }
          : null,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Jobs fetched successfully",
      data: { page, limit, total: count || 0, results },
    });
  } catch (error) {
    console.error("[app/candidates/jobs/send-interest]", error);
    return sendApiResponse(res, { ok: false, code: "FC_03", message: error.message || "Failed to fetch jobs", data: null });
  }
}


function parseJobIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((x) => Number(String(x).trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? [value] : [];
  }
  return [];
}

async function shortlistCandidateForJobs(req, res) {
  try {
    const employerId = toInt(req.body?.employerId ?? req.params?.employerId ?? req.query?.employerId);
    const candidateId = toInt(req.body?.candidateId ?? req.body?.employeeId ?? req.params?.candidateId ?? req.query?.candidateId);
    const jobIds = Array.from(new Set(parseJobIds(req.body?.jobIds ?? req.body?.job_ids ?? req.query?.jobIds)));

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid candidate id is required", data: null });
    }
    if (!jobIds.length) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Valid job ids are required", data: null });
    }

    const results = [];

    for (const jobId of jobIds) {
      const existing = await JobInterest.findOne({
        where: {
          job_id: jobId,
          [Op.or]: [
            { sender_type: "employee", sender_id: candidateId },
            { sender_type: "employer", receiver_id: candidateId },
          ],
        },
        order: [["created_at", "DESC"]],
        paranoid: true,
      });

      if (existing) {
        if (!existing.otp) {
          await existing.update({ otp: generateOtp(4) });
        }

        const existingJson = existing?.toJSON ? existing.toJSON() : existing;
        const status = String(existingJson.status || "").toLowerCase();

        if (status === "pending") {
          await existing.update({ status: "shortlisted" });
          const updated = existing?.toJSON ? existing.toJSON() : existing;
          results.push({
            job_id: jobId,
            action: "updated",
            interest: {
              job_interest_id: updated.id || null,
              status: updated.status || null,
              time: updated.updated_at || updated.created_at || null,
            },
          });
        } else {
          results.push({
            job_id: jobId,
            action: "skipped",
            interest: {
              job_interest_id: existingJson.id || null,
              status: existingJson.status || null,
              time: existingJson.updated_at || existingJson.created_at || null,
            },
          });
        }

        continue;
      }

      const created = await JobInterest.create({
        sender_id: employerId,
        sender_type: "employer",
        receiver_id: candidateId,
        job_id: jobId,
        otp: generateOtp(4),
        status: "shortlisted",
      });

      results.push({
        job_id: jobId,
        action: "created",
        interest: {
          job_interest_id: created.id || null,
          status: created.status || null,
          time: created.created_at || null,
        },
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Candidate shortlisted successfully",
      data: { employer_id: employerId, candidate_id: candidateId, results },
    });
  } catch (error) {
    console.error("[app/candidates/jobs/shortlist]", error);
    return sendApiResponse(res, { ok: false, code: "FC_04", message: error.message || "Failed to shortlist candidate", data: null });
  }
}

async function toggleEmployerCandidateShortlist(req, res) {
  try {
    const employerId = toInt(req.body?.employerId ?? req.params?.employerId ?? req.query?.employerId);
    const candidateId = toInt(req.body?.candidateId ?? req.body?.employeeId ?? req.params?.candidateId ?? req.query?.candidateId);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid candidate id is required", data: null });
    }

    const [employer, candidate] = await Promise.all([
      Employer.findByPk(employerId, { attributes: ["id"], paranoid: false }),
      Employee.findByPk(candidateId, { attributes: ["id"], paranoid: false }),
    ]);

    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Employer not found", data: null });
    }
    if (!candidate) {
      return sendApiResponse(res, { ok: false, code: "FC_04", message: "Candidate not found", data: null });
    }

    const existing = await EmployerShortlistedCandidate.findOne({
      where: { employer_id: employerId, employee_id: candidateId },
      paranoid: false,
    });

    if (existing) {
      await existing.destroy();
      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: "Candidate removed from shortlist successfully",
        data: {
          employer_id: employerId,
          candidate_id: candidateId,
          is_shortlisted: false,
          shortlisted_at: null,
          shortlist_id: null,
          action: "removed",
        },
      });
    }

    const created = await EmployerShortlistedCandidate.create({
      employer_id: employerId,
      employee_id: candidateId,
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Candidate shortlisted successfully",
      data: {
        employer_id: employerId,
        candidate_id: candidateId,
        is_shortlisted: true,
        shortlisted_at: created.updated_at || created.created_at || null,
        shortlist_id: created.id || null,
        action: "added",
      },
    });
  } catch (error) {
    console.error("[app/employers/candidates/shortlist/toggle]", error);
    return sendApiResponse(res, { ok: false, code: "FC_05", message: error.message || "Failed to update shortlist", data: null });
  }
}

async function getEmployerShortlistedCandidates(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.query?.employerId);
    const page = Math.max(toInt(req.query?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(req.query?.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    const { count, rows } = await EmployerShortlistedCandidate.findAndCountAll({
      where: { employer_id: employerId },
      attributes: ["id", "employer_id", "employee_id", "created_at", "updated_at"],
      include: [
        {
          model: Employee,
          as: "Employee",
          required: true,
          attributes: [
            "id",
            "slug",
            "user_id",
            "name",
            "name_hindi",
            "gender",
            "preferred_state_id",
            "preferred_city_id",
            "qualification_id",
            "preferred_shift_id",
            "verification_status",
            "kyc_status",
            "expected_salary",
            "expected_salary_frequency",
            "created_at",
          ],
          include: [
            {
              model: User,
              as: "User",
              attributes: ["id", "name", "name_hindi", "mobile", "is_active"],
              required: true,
            },
            { model: State, as: "PreferredState", attributes: ["state_english", "state_hindi"], required: false },
            { model: City, as: "PreferredCity", attributes: ["city_english", "city_hindi"], required: false },
            {
              model: Qualification,
              as: "Qualification",
              attributes: ["qualification_english", "qualification_hindi"],
              required: false,
            },
            {
              model: EmployeeJobProfile,
              as: "EmployeeJobProfiles",
              attributes: ["employee_id", "job_profile_id"],
              required: false,
              paranoid: true,
              include: [
                {
                  model: JobProfile,
                  as: "JobProfile",
                  attributes: ["profile_english", "profile_hindi"],
                  required: false,
                },
              ],
            },
            { model: Shift, as: "Shift", attributes: ["shift_english"], required: false },
          ],
        },
      ],
      order: [["updated_at", "DESC"], ["created_at", "DESC"]],
      distinct: true,
      limit,
      offset,
    });

    const candidates = (rows || []).map((row) => {
      const shortlistRow = row?.toJSON ? row.toJSON() : row;
      const emp = shortlistRow.Employee || {};
      const jobProfiles = Array.isArray(emp.EmployeeJobProfiles)
        ? emp.EmployeeJobProfiles
            .filter((ejp) => !ejp.deleted_at && ejp.JobProfile)
            .map((ejp) => ({
              id: ejp.job_profile_id,
              profile_english: ejp.JobProfile.profile_english,
              profile_hindi: ejp.JobProfile.profile_hindi,
            }))
        : [];

      return {
        id: emp.id,
        slug: emp.slug || null,
        name: emp.name || emp.User?.name || null,
        name_english: emp.name || emp.User?.name || null,
        name_hindi: emp.name_hindi || emp.User?.name_hindi || null,
        mobile: emp.User?.mobile || null,
        is_active: emp.User?.is_active ?? null,
        gender: emp.gender || null,
        verification_status: emp.verification_status || null,
        kyc_status: emp.kyc_status || null,
        expected_salary: emp.expected_salary ?? null,
        expected_salary_frequency: emp.expected_salary_frequency || null,
        preferred_state: emp.PreferredState?.state_english || emp.PreferredState?.state_hindi || null,
        preferred_state_english: emp.PreferredState?.state_english || null,
        preferred_state_hindi: emp.PreferredState?.state_hindi || null,
        preferred_city: emp.PreferredCity?.city_english || emp.PreferredCity?.city_hindi || null,
        preferred_city_english: emp.PreferredCity?.city_english || null,
        preferred_city_hindi: emp.PreferredCity?.city_hindi || null,
        qualification: emp.Qualification?.qualification_english || emp.Qualification?.qualification_hindi || null,
        preferred_shift: emp.Shift?.shift_english || null,
        job_profiles: jobProfiles,
        created_at: emp.created_at || null,
        shortlist: buildShortlistPayload(shortlistRow),
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Shortlisted candidates fetched successfully",
      data: {
        page,
        limit,
        total: count || 0,
        candidates,
      },
    });
  } catch (error) {
    console.error("[app/employers/:employerId/shortlisted-candidates]", error);
    return sendApiResponse(res, { ok: false, code: "FC_05", message: error.message || "Failed to fetch shortlisted candidates", data: null });
  }
}

async function sendInterestToCandidateForJobs(req, res) {
  try {
    const employerId = toInt(req.body?.employerId ?? req.params?.employerId ?? req.query?.employerId);
    const candidateId = toInt(req.body?.candidateId ?? req.body?.employeeId ?? req.params?.candidateId ?? req.query?.candidateId);
    const jobIds = Array.from(new Set(parseJobIds(req.body?.jobIds ?? req.body?.job_ids ?? req.query?.jobIds)));

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!candidateId || candidateId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid candidate id is required", data: null });
    }
    if (!jobIds.length) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Valid job ids are required", data: null });
    }

    const txResult = await sequelize.transaction(async (transaction) => {
      const employer = await Employer.findByPk(employerId, {
        paranoid: false,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!employer) {
        return { ok: false, code: "FC_05", message: "Employer not found", data: null };
      }

      const expiryAtRaw = employer.credit_expiry_at ? new Date(employer.credit_expiry_at) : null;
      const expiryAt = expiryAtRaw && !Number.isNaN(expiryAtRaw.getTime()) ? expiryAtRaw : null;
      const creditsExpired = !expiryAt || expiryAt.getTime() <= Date.now();

      if (creditsExpired) {
        return {
          ok: false,
          code: "NO_INTEREST_CREDIT",
          message: "Employer credits have expired",
          data: {
            interest_credit: Number(employer.interest_credit || 0),
            credit_expiry_at: employer.credit_expiry_at,
          },
        };
      }

      const resultByJob = new Map();
      const jobsToCreate = [];

      for (const jobId of jobIds) {
        const existing = await JobInterest.findOne({
          where: {
            job_id: jobId,
            [Op.or]: [
              { sender_type: "employee", sender_id: candidateId },
              { sender_type: "employer", receiver_id: candidateId },
            ],
          },
          order: [["created_at", "DESC"]],
          paranoid: true,
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (existing) {
            const duplicateMessage = existing.sender_type === "employer"
              ? "Interest already sent for this job"
              : "Interest already received for this job";

          return {
            ok: false,
            code: "FC_06",
              message: duplicateMessage,
            data: { job_id: jobId },
          };
        }

        jobsToCreate.push(jobId);
      }

      const requiredCredits = jobsToCreate.length;
      const availableInterestCredits = Number(employer.interest_credit || 0);

      if (!Number.isFinite(availableInterestCredits) || availableInterestCredits < requiredCredits) {
        return {
          ok: false,
          code: "NO_INTEREST_CREDIT",
          message: "No interest credit available",
          data: {
            required_credit: requiredCredits,
            interest_credit: Number.isFinite(availableInterestCredits) ? availableInterestCredits : 0,
            credit_expiry_at: employer.credit_expiry_at,
          },
        };
      }

      if (requiredCredits > 0) {
        await employer.update(
          { interest_credit: Math.max(availableInterestCredits - requiredCredits, 0) },
          { transaction },
        );
      }

      for (const jobId of jobsToCreate) {
        const created = await JobInterest.create(
          {
            sender_id: employerId,
            sender_type: "employer",
            receiver_id: candidateId,
            job_id: jobId,
            otp: generateOtp(4),
            status: "pending",
          },
          { transaction },
        );

        resultByJob.set(jobId, {
          job_id: jobId,
          action: "created",
          interest: {
            job_interest_id: created.id || null,
            status: created.status || null,
            time: created.created_at || null,
          },
        });
      }

      const orderedResults = jobIds.map((id) => resultByJob.get(id)).filter(Boolean);
      const remainingInterestCredit = Math.max(availableInterestCredits - requiredCredits, 0);

      return {
        ok: true,
        data: {
          employer_id: employerId,
          candidate_id: candidateId,
          results: orderedResults,
          credit: {
            deducted_interest_credit: requiredCredits,
            remaining_interest_credit: remainingInterestCredit,
            credit_expiry_at: employer.credit_expiry_at || null,
          },
        },
      };
    });

    if (!txResult?.ok) {
      return sendApiResponse(res, {
        ok: false,
        code: txResult?.code || "FC_04",
        message: txResult?.message || "Failed to send interest",
        data: txResult?.data || null,
      });
    }

    const createdResults = (txResult.data?.results || []).filter((item) => item?.action === 'created');
    if (createdResults.length) {
      const [candidate, employer] = await Promise.all([
        Employee.findByPk(candidateId, {
          paranoid: false,
          attributes: ['id', 'user_id', 'name', 'name_hindi'],
        }),
        Employer.findByPk(employerId, {
          paranoid: false,
          attributes: ['id', 'name', 'name_hindi', 'organization_name', 'organization_name_hindi'],
        }),
      ]);

      if (candidate?.user_id) {
        const candidateUser = await User.findByPk(candidate.user_id, {
          paranoid: false,
          attributes: ['id', 'user_type', 'preferred_language', 'fcm_token', 'is_active', 'delete_pending'],
        });

        if (candidateUser) {
          const senderNameEn = employer?.organization_name || employer?.name || employer?.organization_name_hindi || employer?.name_hindi || 'An employer';
          const senderNameHi = employer?.organization_name_hindi || employer?.name_hindi || employer?.organization_name || employer?.name || 'एक नियोक्ता';

          await Promise.all(createdResults.map(async (item) => {
            const jobId = toInt(item?.job_id);
            if (!jobId) return;
            const labels = await getJobProfileLabelsById(jobId);
            await sendToUser({
              user: candidateUser,
              templateKey: 'job_interest.employer_sent',
              templateCtx: { company: senderNameEn, job: labels.english || labels.hindi },
              data: { reference_type: 'job', reference_id: jobId, event: 'job_interest.employer_sent' },
            });
          }));
        }
      }
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Interest sent successfully",
      data: txResult.data,
    });
  } catch (error) {
    console.error("[app/candidates/jobs/send-interest]", error);
    return sendApiResponse(res, { ok: false, code: "FC_04", message: error.message || "Failed to send interest", data: null });
  }
}


async function saveEmployerContactCallExperience(req, res) {
  const t = await sequelize.transaction();
  try {
    const body = req.body || {};
    const employerId = toInt(body.employer_id || body.employerId);
    const employeeId = toInt(body.employee_id || body.employeeId || body.candidate_id || body.candidateId);
    const callExperienceId = body.call_experience_id !== undefined || body.callExperienceId !== undefined
      ? toInt(body.call_experience_id || body.callExperienceId)
      : null;
    const review = body.review === undefined || body.review === null ? null : String(body.review).trim() || null;
    const reviewHindi = body.review_hindi === undefined || body.review_hindi === null ? null : String(body.review_hindi).trim() || null;
    const reviewPair = await fillBilingualPair(review, reviewHindi);

    if (!employerId) {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!employeeId) {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid employee id is required", data: null });
    }

    let contactRow = await EmployerContact.findOne({
      where: { employer_id: employerId, employee_id: employeeId },
      paranoid: false,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (contactRow === null) {
      await t.rollback();
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Contact is not unlocked for this candidate", data: null });
    }

    if (contactRow.deleted_at) {
      await contactRow.restore({ transaction: t });
      contactRow = await EmployerContact.findByPk(contactRow.id, { paranoid: false, transaction: t, lock: t.LOCK.UPDATE });
    }

    if (callExperienceId !== null) {
      const exp = await EmployerCallExperience.findByPk(callExperienceId, { paranoid: false, transaction: t });
      const isActive = exp && (exp.is_active === undefined || exp.is_active === null || Boolean(exp.is_active));
      if (!exp || exp.deleted_at || !isActive) {
        await t.rollback();
        return sendApiResponse(res, { ok: false, code: "FC_04", message: "Invalid call experience id", data: null });
      }
    }

    let history = null;
    if (contactRow.call_experience_id) {
      history = await CallHistory.findByPk(contactRow.call_experience_id, { paranoid: false, transaction: t, lock: t.LOCK.UPDATE });
      if (history && history.deleted_at) {
        await history.restore({ transaction: t });
        history = await CallHistory.findByPk(contactRow.call_experience_id, { paranoid: false, transaction: t, lock: t.LOCK.UPDATE });
      }
      if (history) {
        await history.update(
          {
            user_type: "employer",
            user_id: employerId,
            called_id: employeeId,
            call_experience_id: callExperienceId,
            review: reviewPair.english,
            review_hindi: reviewPair.hindi,
          },
          { transaction: t }
        );
      }
    }

    if (history === null) {
      history = await CallHistory.create(
        {
          user_type: "employer",
          user_id: employerId,
          called_id: employeeId,
          call_experience_id: callExperienceId,
          review: reviewPair.english,
          review_hindi: reviewPair.hindi,
        },
        { transaction: t }
      );

      await contactRow.update({ call_experience_id: history.id }, { transaction: t });
    }

    await t.commit();

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Call experience saved successfully",
      data: {
        employer_id: employerId,
        employee_id: employeeId,
        employer_contact_id: contactRow.id,
        call_history_id: history.id,
        call_experience_id: history.call_experience_id || null,
        review: history.review || null,
        review_hindi: history.review_hindi || null,
        created_at: history.created_at || null,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("[app/candidates/call-experience]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_05",
      message: error.message || "Failed to save call experience",
      data: null,
    });
  }
}


async function reportCandidate(req, res) {
  try {
    const body = req.body || {};
    const employerId = toInt(body.employer_id || body.employerId);
    const candidateId = toInt(body.employee_id || body.employeeId || body.candidate_id || body.candidateId);
    const reasonId = toInt(body.reason_id || body.reasonId);
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const descriptionHindi = typeof body.description_hindi === 'string' ? body.description_hindi.trim() : null;

    const descriptionPair = await fillBilingualPair(description, descriptionHindi);

    if (!employerId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!candidateId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid candidate id is required", data: null });
    }
    if (!reasonId) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Valid reason id is required", data: null });
    }

    const reason = await EmployeeReportReason.findOne({ where: { id: reasonId, is_active: true }, paranoid: true, attributes: ["id"] });
    if (!reason) {
      return sendApiResponse(res, { ok: false, code: "FC_04", message: "Invalid report reason", data: null });
    }

    let report = await Report.findOne({
      where: { user_id: employerId, report_id: candidateId, report_type: "employee" },
      paranoid: false,
      order: [["created_at", "DESC"]],
    });

    if (report) {
      if (report.deleted_at) {
        await report.restore();
      }
      await report.update({ reason_id: reasonId, description: descriptionPair.english, description_hindi: descriptionPair.hindi });
    } else {
      report = await Report.create({
        user_id: employerId,
        report_id: candidateId,
        report_type: "employee",
        reason_id: reasonId,
        description: descriptionPair.english,
        description_hindi: descriptionPair.hindi,
      });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Candidate reported successfully",
      data: {
        id: report.id,
        employer_id: employerId,
        employee_id: candidateId,
        report_type: "employee",
        report_id: candidateId,
        reason_id: reasonId,
        description: report.description || null,
        description_hindi: report.description_hindi || null,
        created_at: report.created_at || null,
      },
    });
  } catch (error) {
    console.error("[app/candidates/report]", error);
    return sendApiResponse(res, { ok: false, code: "FC_05", message: error.message || "Failed to report candidate", data: null });
  }
}




module.exports = {
  getRecommendedCandidates,
  getCandidateDetail,
  getCandidateIdBySlug,
  unlockCandidateContact,
  toggleEmployerCandidateShortlist,
  getEmployerShortlistedCandidates,
  getEmployerActiveJobsForShortlisting,
  getEmployerJobsForSendingInterest,
  shortlistCandidateForJobs,
  sendInterestToCandidateForJobs,
  saveEmployerContactCallExperience,
  reportCandidate,
};
