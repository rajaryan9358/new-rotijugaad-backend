const { sendApiResponse } = require("../_helpers/response");

const { sequelize } = require("../../config/db");

const Sequelize = require("sequelize");
const { Op } = Sequelize;

const {
  Employee,
  Job,
  User,
  State,
  City,
  Qualification,
  Shift,
  EmployeeJobProfile,
  JobProfile,
  EmployerShortlistedCandidate,
} = require("../../models");

const EmployeeExperience = require("../../models/EmployeeExperience");
const EmployeeSkill = require("../../models/EmployeeSkill");
const Skill = require("../../models/Skill");
const SalaryRange = require("../../models/SalaryRange");

const SUCCESS_CODE = "SC_01";

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

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function toFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

  const parts = text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

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

async function getAllCandidates(req, res) {
  try {
    const input = (req.method === "POST" && req.body && Object.keys(req.body).length)
      ? req.body
      : (req.query || {});

    const search = String(input?.search || "").trim();

    const jobProfileIds = parseIdList(input?.job_profile_ids || input?.job_profile_id);
    const preferredStateIds = parseIdList(input?.preferred_state_ids || input?.state_ids);
    const preferredCityIds = parseIdList(input?.preferred_city_ids || input?.city_ids);
    const qualificationIds = parseIdList(input?.qualification_ids);
    const shiftIds = parseIdList(input?.shift_ids);
    const skillIds = parseIdList(input?.skill_ids);
    const salaryRangeIds = parseIdList(input?.salary_range_ids);

    const experienceRanges = parseRangeList(input?.experience_ranges);
    const distanceRanges = parseRangeList(input?.distance_ranges);

    const genderFilter = normalizeGender(input?.gender);
    const salaryFrequencyFilter = normalizeSalaryFrequency(
      input?.expected_salary_frequency || input?.expected_salary_freq || input?.salary_frequency
    );
    const verificationFilter = String(input?.verification_status || "").trim().toLowerCase();

    console.log('[candidates] raw distance_ranges input:', JSON.stringify(input?.distance_ranges));
    console.log('[candidates] parsed distanceRanges:', JSON.stringify(distanceRanges));

    // Distance filter: collect all active job lat/lng for the employer as multi-origin points.
    let jobOrigins = []; // [{lat, lng}]
    let skipDistanceFilter = false;

    if (distanceRanges.length) {
      const employerIdForDist = toInt(input?.employer_id || input?.employerId);
      console.log('[candidates:distance] distanceRanges active, employerIdForDist:', employerIdForDist);

      if (employerIdForDist > 0) {
        const activeJobsForDist = await Job.findAll({
          where: {
            employer_id: employerIdForDist,
            status: 'active',
            [Op.or]: [{ expired_at: { [Op.is]: null } }, { expired_at: { [Op.gt]: new Date() } }],
          },
          attributes: ['id', 'lat', 'lng'],
          paranoid: false,
        });
        console.log('[candidates:distance] active jobs found:', activeJobsForDist.length,
          activeJobsForDist.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng })));

        jobOrigins = (activeJobsForDist || [])
          .map((j) => ({ lat: toFloat(j.lat), lng: toFloat(j.lng) }))
          .filter((o) => o.lat !== null && o.lng !== null);
        console.log('[candidates:distance] jobOrigins with valid lat/lng:', jobOrigins.length, jobOrigins);
      } else {
        console.log('[candidates:distance] no valid employerId — skipping distance filter');
      }

      if (!jobOrigins.length) {
        skipDistanceFilter = true;
        console.log('[candidates:distance] skipDistanceFilter=true (no job origins with coordinates)');
      }
    } else {
      console.log('[candidates:distance] no distanceRanges — distance filter not applied');
    }

    const page = Math.max(toInt(input?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(input?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;
    const employerId = toInt(input?.employer_id || input?.employerId);

    const where = {};
    const and = [];

    if (verificationFilter === "not_verified") {
      where.kyc_status = { [Op.notIn]: ["verified", "approved"] };
    } else if (verificationFilter) {
      where.kyc_status = { [Op.in]: ["verified", "approved"] };
    }

    if (preferredStateIds.length) where.preferred_state_id = { [Op.in]: preferredStateIds };
    if (preferredCityIds.length) where.preferred_city_id = { [Op.in]: preferredCityIds };
    if (qualificationIds.length) where.qualification_id = { [Op.in]: qualificationIds };
    if (shiftIds.length) where.preferred_shift_id = { [Op.in]: shiftIds };

    if (genderFilter && genderFilter !== "any") {
      where.gender = genderFilter;
    }

    if (salaryFrequencyFilter) {
      where.expected_salary_frequency = salaryFrequencyFilter;
    }

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

    // Collect employee ID restrictions from subquery-based filters; null = unrestricted.
    let restrictedEmployeeIds = null;

    function intersectIds(current, incoming) {
      if (current === null) return new Set(incoming);
      return new Set(incoming.filter((id) => current.has(id)));
    }

    if (experienceRanges.length) {
      // Normalize stored work_duration to years before comparing against year-based range filter.
      // Employees may store duration in months or days, so convert: month→÷12, day→÷365, year→as-is.
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

      const expWhere = orRanges.length ? { [Op.or]: orRanges } : {};
      const expRows = await EmployeeExperience.findAll({
        attributes: ["user_id"],
        where: expWhere,
        paranoid: true,
      });

      const expIds = (expRows || []).map((r) => r.user_id).filter(Boolean);
      restrictedEmployeeIds = intersectIds(restrictedEmployeeIds, expIds);
    }

    if (skillIds.length) {
      const skillRows = await EmployeeSkill.findAll({
        attributes: ["user_id"],
        where: { skill_id: { [Op.in]: skillIds } },
        paranoid: false,
      });

      const skillEmpIds = (skillRows || []).map((r) => r.user_id).filter(Boolean);
      restrictedEmployeeIds = intersectIds(restrictedEmployeeIds, skillEmpIds);
    }

    if (restrictedEmployeeIds !== null) {
      if (restrictedEmployeeIds.size === 0) {
        return sendApiResponse(res, {
          ok: true,
          code: SUCCESS_CODE,
          message: "Candidates fetched successfully",
          data: { page, limit, total: 0, candidates: [] },
        });
      }
      where.id = { [Op.in]: Array.from(restrictedEmployeeIds) };
    }

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
        if (orRanges.length) {
          and.push({ [Op.or]: orRanges });
        }
      }
    }

    if (distanceRanges.length && !skipDistanceFilter && jobOrigins.length) {
      and.push({ lat: { [Op.ne]: null }, lng: { [Op.ne]: null } });

      // Build one haversine expression per job origin, then wrap in LEAST(...) so we get
      // the minimum distance from the employee to any active job before applying the filter.
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

      const minDistSql = distExprs.length === 1
        ? distExprs[0]
        : `LEAST(${distExprs.join(', ')})`;
      const minDistExpr = Sequelize.literal(`(${minDistSql})`);

      const rangeConds = [];
      for (const r of distanceRanges) {
        const effectiveMin = r.min !== null && r.min !== undefined ? r.min : 0;
        const { max } = r;
        console.log('[candidates:distance] applying range — effectiveMin:', effectiveMin, 'max:', max);
        if (max != null) rangeConds.push(Sequelize.where(minDistExpr, { [Op.between]: [effectiveMin, max] }));
        else rangeConds.push(Sequelize.where(minDistExpr, { [Op.gte]: effectiveMin }));
      }

      console.log('[candidates:distance] SQL minDist expression:', minDistSql);
      console.log('[candidates:distance] rangeConds count:', rangeConds.length);

      if (rangeConds.length === 1) and.push(rangeConds[0]);
      else if (rangeConds.length > 1) and.push({ [Op.or]: rangeConds });
    } else {
      console.log('[candidates:distance] SQL distance filter NOT applied —',
        'distanceRanges.length:', distanceRanges.length,
        'skipDistanceFilter:', skipDistanceFilter,
        'jobOrigins.length:', jobOrigins.length);
    }

    if (and.length) where[Op.and] = and;

    const employeeJobProfilesInclude = {
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
    };

    if (jobProfileIds.length) {
      employeeJobProfilesInclude.required = true;
      employeeJobProfilesInclude.where = { job_profile_id: { [Op.in]: jobProfileIds } };
    }

    where.verification_status = 'verified';

    const { count, rows } = await Employee.findAndCountAll({
      where,
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
        "selfie_link",
        "lat",
        "lng",
        "created_at",
      ],
      include: [
        {
          model: User,
          as: "User",
          attributes: ["id", "name", "name_hindi", "mobile", "is_active"],
          where: { is_active: 1 },
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
        { model: Shift, as: "Shift", attributes: ["shift_english"], required: false },
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
      if (!jobOrigins.length) {
        // distance_km stays null — no job origins available
      } else if (emp.lat == null || emp.lng == null) {
        console.log('[candidates:distance_km] employee', emp.id, 'has no lat/lng — distance_km=null');
      } else {
        const empLat = Number(emp.lat);
        const empLng = Number(emp.lng);
        if (!Number.isFinite(empLat) || !Number.isFinite(empLng)) {
          console.log('[candidates:distance_km] employee', emp.id, 'non-finite lat/lng:', emp.lat, emp.lng);
        } else {
          const distances = jobOrigins.map((o) => haversineKm(o.lat, o.lng, empLat, empLng));
          distance_km = Math.round(Math.min(...distances) * 10) / 10;
          console.log('[candidates:distance_km] employee', emp.id,
            'lat:', empLat, 'lng:', empLng,
            'distances to each origin:', distances.map((d) => d.toFixed(2)),
            '→ min distance_km:', distance_km);
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
        preferred_state:
          emp.PreferredState?.state_english ||
          emp.PreferredState?.state_hindi ||
          null,
        preferred_state_english: emp.PreferredState?.state_english || null,
        preferred_state_hindi: emp.PreferredState?.state_hindi || null,
        preferred_city:
          emp.PreferredCity?.city_english ||
          emp.PreferredCity?.city_hindi ||
          null,
        preferred_city_english: emp.PreferredCity?.city_english || null,
        preferred_city_hindi: emp.PreferredCity?.city_hindi || null,
        qualification:
          emp.Qualification?.qualification_english || emp.Qualification?.qualification_hindi || null,
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
      message: "Candidates fetched successfully",
      data: {
        page,
        limit,
        total: count || 0,
        candidates,
      },
    });
  } catch (error) {
    console.error("[app/candidates]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: error.message || "Failed to fetch candidates",
      data: null,
    });
  }
}

module.exports = {
  getAllCandidates,
};
