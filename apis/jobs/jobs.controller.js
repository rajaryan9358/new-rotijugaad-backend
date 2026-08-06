const { sendApiResponse, isTruthyEnv } = require("../_helpers/response");

const { sequelize } = require("../../config/db");
const Sequelize = require("sequelize");
const { Op } = Sequelize;

const {
  Employee,
  EmployeeJobProfile,
  Job,
  Employer,
  User,
  JobProfile,
  JobGender,
  JobExperience,
  Experience,
  JobQualification,
  Qualification,
  JobShift,
  Shift,
  JobSkill,
  Skill,
  SalaryType,
  SelectedJobBenefit,
  JobBenefit,
  State,
  City,
  InterviewerContactOtp,
} = require("../../models");

const Wishlist = require("../../models/Wishlist");
const EmployeeContact = require("../../models/EmployeeContact");
const { verifyOtp: verifyTwoFactorOtp, sendTransactionalSms } = require('../../utils/twoFactor');

const SUCCESS_CODE = "SC_01";

function isExpiredJobRow(job) {
  if (String(job?.status || "").toLowerCase() === "expired") return true;
  if (!job?.expired_at) return false;

  const expiry = new Date(job.expired_at);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() <= Date.now();
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

function normalizeGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (g === "male" || g === "female" || g === "any") return g;
  return null;
}


function normalizeMobileLike(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function uniqueJoined(values) {
  const items = Array.from(new Set((values || []).filter(Boolean)));
  return items.length ? items.join(', ') : null;
}

// Employer uses this before creating a job (job row does not exist yet)
async function sendInterviewerContactOtpForJob(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.body?.employer_id ?? req.body?.employerId);
    const interviewer_contact = normalizeMobileLike(req.body?.interviewer_contact ?? req.body?.mobile);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!interviewer_contact) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "interviewer_contact is required", data: null });
    }

    const employer = await Employer.findByPk(employerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Employer not found", data: null });
    }

    const generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
    const otpMessage = `Your OTP to add your no as Interviewer in Roti Jugaad App is ${generatedOtp} - valid for 10 minutes. Please do not share with others.`;
    await sendTransactionalSms({
      mobile: interviewer_contact,
      from: process.env.TWO_FACTOR_SENDER_ID || 'RJUGAD',
      msg: otpMessage,
    });

    const now = new Date();
    const expiresAt = addMinutes(now, 10);

    // Keep at most one ACTIVE (unverified) OTP row per employer + interviewer_contact.
    // If there is an active unverified row, update it (resend OTP).
    // If the latest row is already verified, create a new row.
    let row = await InterviewerContactOtp.findOne({
      where: {
        employer_id: employerId,
        interviewer_contact,
        is_active: true,
      },
      order: [["id", "DESC"]],
      paranoid: false,
    });

    if (row && row.deleted_at) {
      await row.restore();
    }

    if (row && row.verified_at) {
      // Should not happen after migration, but keep safe.
      await row.update({ is_active: null });
      row = null;
    }

    if (row) {
      await row.update({
        otp: generatedOtp,
        session_id: null,
        otp_created_at: now,
        expires_at: expiresAt,
        verified_at: null,
        is_active: true,
        attempts: 0,
        last_attempt_at: null,
      });
    } else {
      try {
        row = await InterviewerContactOtp.create({
          employer_id: employerId,
          interviewer_contact,
          otp: generatedOtp,
          session_id: null,
          otp_created_at: now,
          expires_at: expiresAt,
          verified_at: null,
          is_active: true,
          attempts: 0,
          last_attempt_at: null,
        });
      } catch (err) {
        // If two requests race, the active-unique index may throw on create.
        // In that case, re-fetch and update the existing active row instead of failing.
        if (err && err.name === "SequelizeUniqueConstraintError") {
          row = await InterviewerContactOtp.findOne({
            where: {
              employer_id: employerId,
              interviewer_contact,
              is_active: true,
            },
            order: [["id", "DESC"]],
            paranoid: false,
          });

          if (!row) throw err;

          if (row.deleted_at) {
            await row.restore();
          }

          if (row.verified_at) {
            await row.update({ is_active: null });
            row = await InterviewerContactOtp.create({
              employer_id: employerId,
              interviewer_contact,
              otp: generatedOtp,
              session_id: null,
              otp_created_at: now,
              expires_at: expiresAt,
              verified_at: null,
              is_active: true,
              attempts: 0,
              last_attempt_at: null,
            });
          } else {
            await row.update({
              otp: generatedOtp,
              session_id: null,
              otp_created_at: now,
              expires_at: expiresAt,
              verified_at: null,
              is_active: true,
              attempts: 0,
              last_attempt_at: null,
            });
          }
        } else {
          throw err;
        }
      }
    }

    const includeOtp = isTruthyEnv(process.env.DEBUG_OTP);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "OTP sent successfully",
      data: includeOtp
        ? {
            employer_id: employerId,
            interviewer_contact,
            verification_id: row.id,
            expires_at: expiresAt,
            otp: generatedOtp,
          }
        : { employer_id: employerId, interviewer_contact, verification_id: row.id, expires_at: expiresAt },
    });
  } catch (error) {
    console.error("[app/jobs/interviewer-contact/send-otp]", error);

    const raw = String(error?.message || error?.parent?.sqlMessage || '');
    const isSchemaMissing =
      raw.includes('Unknown column') ||
      raw.includes('ER_BAD_FIELD_ERROR') ||
      raw.includes('doesn\'t exist');

    const mentionsIsActive = raw.includes('is_active');
    const mentionsOldIndex = raw.includes('uniq_interviewer_contact_otp_employer_mobile');

    const message = (isSchemaMissing && mentionsIsActive)
      ? 'Server database schema is outdated (missing is_active). Please run backend migrations and restart the server.'
      : (mentionsOldIndex)
        ? 'Server database schema is outdated (old OTP unique index). Please run backend migrations and restart the server.'
        : 'Failed to send OTP';

    return sendApiResponse(res, { ok: false, code: "FC_04", message, data: null });
  }
}

async function verifyInterviewerContactOtpForJob(req, res) {
  try {
    const employerId = toInt(req.params?.employerId ?? req.body?.employer_id ?? req.body?.employerId);
    const otp = String(req.body?.otp || "").trim();
    const interviewer_contact = normalizeMobileLike(req.body?.interviewer_contact ?? req.body?.mobile);
    const verificationId = toInt(req.body?.verification_id ?? req.body?.verificationId);

    if (!employerId || employerId <= 0) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!otp) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "otp is required", data: null });
    }

    const employer = await Employer.findByPk(employerId);
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Employer not found", data: null });
    }

    const now = new Date();

    let row;
    if (verificationId) {
      row = await InterviewerContactOtp.findOne({
        where: { id: verificationId, employer_id: employerId, verified_at: null, is_active: true },
        paranoid: false,
      });

      if (!row) {
        const verifiedRow = await InterviewerContactOtp.findOne({
          where: { id: verificationId, employer_id: employerId, verified_at: { [Op.ne]: null } },
          paranoid: false,
        });
        if (verifiedRow) {
          return sendApiResponse(res, {
            ok: true,
            code: SUCCESS_CODE,
            message: "Already verified",
            data: { verification_id: verifiedRow.id, interviewer_contact: verifiedRow.interviewer_contact },
          });
        }
      }
    } else {
      if (!interviewer_contact) {
        return sendApiResponse(res, { ok: false, code: "FC_04", message: "interviewer_contact is required", data: null });
      }

      row = await InterviewerContactOtp.findOne({
        where: { employer_id: employerId, interviewer_contact, verified_at: null, is_active: true },
        order: [["id", "DESC"]],
        paranoid: false,
      });
    }

    if (!row) {
      return sendApiResponse(res, { ok: false, code: "FC_05", message: "OTP request not found", data: null });
    }

    if (row.verified_at) {
      return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Already verified", data: { verification_id: row.id, interviewer_contact: row.interviewer_contact } });
    }

    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    if (expiresAt == null || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      return sendApiResponse(res, { ok: false, code: "FC_06", message: "OTP expired", data: null });
    }

    const sessionId = String(row.session_id || '').trim();
    let matched = false;
    let verificationDetails = '';

    if (sessionId) {
      const verification = await verifyTwoFactorOtp(sessionId, otp);
      matched = verification.matched;
      verificationDetails = verification.details || '';
    } else {
      matched = Boolean(row.otp) && String(row.otp) === otp;
    }

    if (!matched) {
      const attempts = Number(row.attempts || 0) + 1;
      await row.update({ attempts, last_attempt_at: now });

      if (attempts >= 5) {
        await row.update({ expires_at: now, is_active: null });
        return sendApiResponse(res, { ok: false, code: "FC_07", message: "Too many invalid attempts. Please request a new OTP.", data: null });
      }

      return sendApiResponse(res, {
        ok: false,
        code: "FC_08",
        message: verificationDetails || "Invalid OTP",
        data: { remaining_attempts: Math.max(0, 5 - attempts) },
      });
    }

    await row.update({ verified_at: now, is_active: null, otp: '', session_id: null, expires_at: now });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "OTP verified successfully",
      data: { verification_id: row.id, interviewer_contact: row.interviewer_contact, verified_at: row.verified_at },
    });
  } catch (error) {
    console.error("[app/jobs/interviewer-contact/verify-otp]", error);
    return sendApiResponse(res, { ok: false, code: "FC_09", message: "Failed to verify OTP", data: null });
  }
}

function formatTime12h(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr);
  const parts = s.split(":");
  if (parts.length < 2) return s;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  if (Number.isNaN(h)) return s;
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

function shiftTimingDisplay(start, end) {
  const a = formatTime12h(start);
  const b = formatTime12h(end);
  if (!a && !b) return null;
  if (a && b) return `${a} - ${b}`;
  return a || b;
}

function jobLife(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  const days = Math.max(Math.floor(ms / 86400000), 0);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

async function getRecommendedJobs(req, res) {
  try {
    const employeeId = toInt(req.params?.employeeId);
    if (!employeeId || employeeId <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid employee id is required",
        data: null,
      });
    }

    const input = (req.method === "POST" && req.body && Object.keys(req.body).length) ? req.body : (req.query || {});

    const search = String(input?.search || "").trim();

    const jobProfileIdsFilter = parseIdList(input?.job_profile_ids || input?.job_profile_id);
    const stateIds = parseIdList(input?.preferred_state_ids || input?.state_ids || input?.job_state_ids);
    const cityIds = parseIdList(input?.preferred_city_ids || input?.city_ids || input?.job_city_ids);
    const salaryTypeIds = parseIdList(input?.salary_type_ids || input?.salary_type_id);

    const skillIds = parseIdList(input?.skill_ids);
    const qualificationIds = parseIdList(input?.qualification_ids);
    const shiftIds = parseIdList(input?.shift_ids);
    const businessCategoryIds = parseIdList(input?.business_category_ids);

    const salaryRanges = parseRangeList(input?.salary_ranges);
    const experienceRanges = parseRangeList(input?.experience_ranges);
    const distanceRanges = parseRangeList(input?.distance_ranges);

    const verificationFilter = String(input?.verification || input?.verification_status || "").trim().toLowerCase();
    const genderFilterInput = normalizeGender(input?.gender);

    const employee = await Employee.findByPk(employeeId, {
      attributes: ["id", "gender", "expected_salary", "preferred_state_id", "preferred_city_id", "lat", "lng"],
      paranoid: true,
    });

    if (!employee) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_02",
        message: "Employee not found",
        data: null,
      });
    }

    const profileRows = await EmployeeJobProfile.findAll({
      where: { employee_id: employeeId },
      attributes: ["job_profile_id"],
      paranoid: true,
    });

    const baseJobProfileIds = (profileRows || []).map((r) => r.job_profile_id).filter(Boolean);
    if (!baseJobProfileIds.length) {
      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: "Recommended jobs fetched successfully",
        data: [],
      });
    }

    const jobProfileIds = (jobProfileIdsFilter && jobProfileIdsFilter.length)
      ? baseJobProfileIds.filter((id) => jobProfileIdsFilter.includes(id))
      : baseJobProfileIds;

    if (!jobProfileIds.length) {
      return sendApiResponse(res, {
        ok: true,
        code: SUCCESS_CODE,
        message: "Recommended jobs fetched successfully",
        data: [],
      });
    }

    const expectedSalary = (employee.expected_salary === null || employee.expected_salary === undefined || employee.expected_salary === "")
      ? null
      : Number(employee.expected_salary);

    let originLat = null;
    let originLng = null;
    const queryLat = toFloat(input?.lat);
    const queryLng = toFloat(input?.lng);

    if (distanceRanges.length) {
      // Prefer request-provided lat/lng if present.
      if (queryLat !== null && queryLng !== null) {
        originLat = queryLat;
        originLng = queryLng;
      } else {
        originLat = toFloat(employee?.lat);
        originLng = toFloat(employee?.lng);

        if (originLat === null || originLng === null) {
          return sendApiResponse(res, {
            ok: false,
            code: "FC_01",
            message: "Distance filtering requires employee lat/lng (or lat/lng in request)",
            data: null,
          });
        }
      }
    }

    const where = {
      job_profile_id: { [Op.in]: jobProfileIds },
    };

    if (salaryTypeIds.length) where.salary_type_id = { [Op.in]: salaryTypeIds };

    where.verification_status = "approved";

    const and = [];

    and.push({
      status: "active",
      [Op.or]: [
        { expired_at: { [Op.is]: null } },
        { expired_at: { [Op.gt]: new Date() } },
      ],
    });

    // Preferred location (unless explicit filter provided)
    if (!stateIds.length && employee.preferred_state_id) where.job_state_id = employee.preferred_state_id;
    if (!cityIds.length && employee.preferred_city_id) where.job_city_id = employee.preferred_city_id;

    // Explicit location filters (same semantics as get-all)
    if (stateIds.length) {
      and.push({
        [Op.or]: [
          { job_state_id: { [Op.in]: stateIds } },
          { "$Employer.state_id$": { [Op.in]: stateIds } },
        ],
      });
    }

    if (cityIds.length) {
      and.push({
        [Op.or]: [
          { job_city_id: { [Op.in]: cityIds } },
          { "$Employer.city_id$": { [Op.in]: cityIds } },
        ],
      });
    }

    if (businessCategoryIds.length) {
      and.push({ "$Employer.business_category_id$": { [Op.in]: businessCategoryIds } });
    }

    if (verificationFilter === "verified") {
      and.push(
        Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.fn("COALESCE", Sequelize.col("Employer.kyc_status"), "")),
          { [Op.eq]: "verified" }
        )
      );
    } else if (verificationFilter === "not_verified") {
      and.push(
        Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.fn("COALESCE", Sequelize.col("Employer.kyc_status"), "")),
          { [Op.ne]: "verified" }
        )
      );
    }

    if (search) {
      const like = sequelize.escape("%" + search.toLowerCase() + "%");
      and.push(Sequelize.literal(`(
        LOWER(COALESCE(\`JobProfile\`.\`profile_english\`, '')) LIKE ${like}
        OR LOWER(COALESCE(\`JobProfile\`.\`profile_hindi\`, '')) LIKE ${like}
        OR LOWER(COALESCE(\`Job\`.\`job_designation_english\`, '')) LIKE ${like}
        OR LOWER(COALESCE(\`Job\`.\`job_designation_hindi\`, '')) LIKE ${like}
      )`));
    }

    if (salaryRanges.length) {
      const orRanges = [];
      for (const r of salaryRanges) {
        const min = r.min;
        const max = r.max;
        const parts = [];
        if (max !== null && max !== undefined) {
          parts.push({ [Op.or]: [{ salary_min: { [Op.is]: null } }, { salary_min: { [Op.lte]: max } }] });
        }
        if (min !== null && min !== undefined) {
          parts.push({ [Op.or]: [{ salary_max: { [Op.is]: null } }, { salary_max: { [Op.gte]: min } }] });
        }
        if (parts.length) orRanges.push({ [Op.and]: parts });
      }
      if (orRanges.length) and.push({ [Op.or]: orRanges });
    }

    if (Number.isFinite(expectedSalary)) {
      and.push(Sequelize.literal(`(Job.salary_min IS NULL OR Job.salary_min <= ${sequelize.escape(expectedSalary)})`));
      and.push(Sequelize.literal(`(Job.salary_max IS NULL OR Job.salary_max >= ${sequelize.escape(expectedSalary)})`));
    }

    const genderEffective = genderFilterInput || normalizeGender(employee.gender);
    if (genderEffective && genderEffective !== "any") {
      and.push(
        Sequelize.literal(`(
          NOT EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id)
          OR EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id AND LOWER(jg.gender) = 'any')
          OR EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id AND LOWER(jg.gender) = ${sequelize.escape(genderEffective)})
        )`)
      );
    }

    let distanceKmExpr = null;
    if (distanceRanges.length) {
      and.push({ lat: { [Op.ne]: null }, lng: { [Op.ne]: null } });

      const oLat = Number(originLat);
      const oLng = Number(originLng);
      distanceKmExpr = Sequelize.literal(
        "(6371 * ACOS(LEAST(1, GREATEST(-1," +
          " COS(RADIANS(" + oLat + "))" +
          " * COS(RADIANS(Job.lat))" +
          " * COS(RADIANS(Job.lng) - RADIANS(" + oLng + "))" +
          " + SIN(RADIANS(" + oLat + ")) * SIN(RADIANS(Job.lat))" +
        "))))"
      );

      const distOr = [];
      for (const r of distanceRanges) {
        const effectiveMin = r.min !== null && r.min !== undefined ? r.min : 0;
        const { max } = r;
        if (max !== null && max !== undefined) {
          distOr.push(Sequelize.where(distanceKmExpr, { [Op.between]: [effectiveMin, max] }));
        } else {
          distOr.push(Sequelize.where(distanceKmExpr, { [Op.gte]: effectiveMin }));
        }
      }
      if (distOr.length) and.push({ [Op.or]: distOr });
    }

    // include filters using join tables
    const jobSkillsInclude = {
      model: JobSkill,
      as: "JobSkills",
      attributes: ["skill_id"],
      required: false,
      include: [{ model: Skill, as: "Skill", attributes: ["skill_english"], required: false }],
    };
    if (skillIds.length) {
      jobSkillsInclude.required = true;
      jobSkillsInclude.where = { skill_id: { [Op.in]: skillIds } };
    }

    const jobQualificationsInclude = {
      model: JobQualification,
      as: "JobQualifications",
      attributes: ["qualification_id"],
      required: false,
      include: [{ model: Qualification, as: "Qualification", attributes: ["qualification_english"], required: false }],
    };
    if (qualificationIds.length) {
      jobQualificationsInclude.required = true;
      jobQualificationsInclude.where = { qualification_id: { [Op.in]: qualificationIds } };
    }

    const jobShiftsInclude = {
      model: JobShift,
      as: "JobShifts",
      attributes: ["shift_id"],
      required: false,
      include: [{ model: Shift, as: "Shift", attributes: ["shift_english"], required: false }],
    };
    if (shiftIds.length) {
      jobShiftsInclude.required = true;
      jobShiftsInclude.where = { shift_id: { [Op.in]: shiftIds } };
    }

    const jobExperiencesInclude = {
      model: JobExperience,
      as: "JobExperiences",
      attributes: ["experience_id"],
      required: false,
      include: [{ model: Experience, as: "Experience", attributes: ["title_english", "exp_from", "exp_to"], required: false }],
    };
    if (experienceRanges.length) {
      const orRanges = [];
      for (const r of experienceRanges) {
        const min = r.min;
        const max = r.max;
        const parts = [];
        if (max !== null && max !== undefined) parts.push({ exp_from: { [Op.lte]: max } });
        if (min !== null && min !== undefined) parts.push({ exp_to: { [Op.gte]: min } });
        if (parts.length) orRanges.push({ [Op.and]: parts });
      }
      jobExperiencesInclude.required = true;
      jobExperiencesInclude.include[0].required = true;
      jobExperiencesInclude.include[0].where = orRanges.length ? { [Op.or]: orRanges } : undefined;
    }

    if (and.length) where[Op.and] = and;

    const jobs = await Job.findAll({
      where,
      attributes: [
        "id",
        "employer_id",
        "job_profile_id",
        "is_household",
        "interviewer_contact",
        "work_start_time",
        "work_end_time",
        "salary_min",
        "salary_max",
        "salary_type_id",
        "no_vacancy",
        "hired_total",
        "status",
        "verification_status",
        "show_organization",
        "job_state_id",
        "job_city_id",
        "lat",
        "lng",
        "created_at",
        "expired_at",
      ],
      include: [
        {
          model: Employer,
          as: "Employer",
          attributes: ["id", "name", "name_hindi", "organization_name", "organization_name_hindi", "organization_type", "state_id", "city_id", "business_category_id", "kyc_status"],
          where: { verification_status: "verified" },
          required: true,
          include: [{ model: User, as: "User", attributes: ["mobile"], where: { is_active: 1 }, required: true }],
        },
        { model: JobProfile, as: "JobProfile", attributes: ["id", "profile_english", "profile_hindi"], required: false },
        { model: SalaryType, as: "SalaryType", attributes: ["id", "type_english", "type_hindi"], required: false },
        { model: JobGender, as: "JobGenders", attributes: ["gender"], required: false },
        jobExperiencesInclude,
        jobQualificationsInclude,
        jobShiftsInclude,
        jobSkillsInclude,
        {
          model: SelectedJobBenefit,
          as: "SelectedJobBenefits",
          attributes: ["benefit_id"],
          required: false,
          include: [{ model: JobBenefit, as: "JobBenefit", attributes: ["benefit_english"], required: false }],
        },
        { model: State, as: "JobState", attributes: ["id", "state_english", "state_hindi"], required: false },
        { model: City, as: "JobCity", attributes: ["id", "city_english", "city_hindi"], required: false },
      ],
      order: [["created_at", "DESC"]],
      limit: 200,
    });

    const jobIds = (jobs || []).map((j) => j.id).filter(Boolean);

    let wishlistedJobIds = new Set();
    if (employeeId && jobIds.length) {
      const wishlistRows = await Wishlist.findAll({
        where: { employee_id: employeeId, job_id: { [Op.in]: jobIds } },
        attributes: ['job_id'],
      });
      wishlistedJobIds = new Set((wishlistRows || []).map((r) => r.job_id).filter(Boolean));
    }

    let unlockedJobIds = new Set();
    if (employeeId && jobIds.length) {
      const contactRows = await EmployeeContact.findAll({
        where: { employee_id: employeeId, job_id: { [Op.in]: jobIds } },
        attributes: ['job_id'],
        paranoid: true,
      });
      unlockedJobIds = new Set((contactRows || []).map((r) => r.job_id).filter(Boolean));
    }

    const data = (jobs || []).map((job) => {
      const employer = job.Employer || null;
      const employerPhone = employer?.User?.mobile || null;

      const genders = (job.JobGenders || []).map((g) => g.gender).filter(Boolean);
      const experiences = (job.JobExperiences || []).map((x) => x.Experience?.title_english).filter(Boolean);
      const qualifications = (job.JobQualifications || []).map((x) => x.Qualification?.qualification_english).filter(Boolean);
      const shifts = (job.JobShifts || []).map((x) => x.Shift?.shift_english).filter(Boolean);
      const skills = (job.JobSkills || []).map((x) => x.Skill?.skill_english).filter(Boolean);
      const benefits = (job.SelectedJobBenefits || []).map((x) => x.JobBenefit?.benefit_english).filter(Boolean);

      const isExpired = isExpiredJobRow(job);

      let distance_km = null;
      if (distanceKmExpr !== null && originLat !== null && originLng !== null &&
          job.lat != null && job.lng != null) {
        const jLat = Number(job.lat);
        const jLng = Number(job.lng);
        if (Number.isFinite(jLat) && Number.isFinite(jLng)) {
          distance_km = Math.round(haversineKm(Number(originLat), Number(originLng), jLat, jLng) * 10) / 10;
        }
      }

      const showOrg = Number(job.show_organization) !== 0;
      const contactUnlocked = unlockedJobIds.has(job.id);
      const revealOrgData = showOrg || contactUnlocked;

      return {
        job_id: job.id,
        is_wishlisted: wishlistedJobIds.has(job.id),
        show_organization: showOrg ? 1 : 0,
        is_contact_unlocked: contactUnlocked,
        distance_km,
        employer_id: job.employer_id,
        Employer: employer
          ? {
              id: employer.id,
              name: employer.name || null,
              name_hindi: employer.name_hindi || null,
              organization_name: revealOrgData ? (employer.organization_name || null) : null,
              organization_name_hindi: revealOrgData ? (employer.organization_name_hindi || null) : null,
              organization_type: employer.organization_type || null,
              kyc_status: revealOrgData ? (employer.kyc_status || null) : null,
            }
          : null,
        employer_name: employer?.name || null,
        employer_name_english: employer?.name || null,
        employer_name_hindi: employer?.name_hindi || null,
        organization_name: revealOrgData ? (employer?.organization_name || null) : null,
        organization_name_english: revealOrgData ? (employer?.organization_name || null) : null,
        organization_name_hindi: revealOrgData ? (employer?.organization_name_hindi || null) : null,
        organization_type: employer?.organization_type || null,
        employer_phone: employerPhone,
        interviewer_contact: job.interviewer_contact || null,
        job_profile_id: job.job_profile_id || null,
        JobProfile: job.JobProfile
          ? {
              id: job.JobProfile.id,
              profile_english: job.JobProfile.profile_english || null,
              profile_hindi: job.JobProfile.profile_hindi || null,
            }
          : null,
        job_profile: job.JobProfile?.profile_english || job.JobProfile?.profile_hindi || null,
        job_profile_english: job.JobProfile?.profile_english || null,
        job_profile_hindi: job.JobProfile?.profile_hindi || null,
        shift_timing_display: shiftTimingDisplay(job.work_start_time, job.work_end_time),
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_type_id: job.salary_type_id || null,
        SalaryType: job.SalaryType
          ? {
              id: job.SalaryType.id,
              type_english: job.SalaryType.type_english || null,
              type_hindi: job.SalaryType.type_hindi || null,
            }
          : null,
        salary_type: job.SalaryType?.type_english || job.SalaryType?.type_hindi || null,
        salary_type_english: job.SalaryType?.type_english || null,
        salary_type_hindi: job.SalaryType?.type_hindi || null,
        is_household: !!job.is_household,
        genders: uniqueJoined(genders),
        experiences: uniqueJoined(experiences),
        qualifications: uniqueJoined(qualifications),
        shifts: uniqueJoined(shifts),
        skills: uniqueJoined(skills),
        benefits: uniqueJoined(benefits),
        verification_status: job.verification_status,
        no_vacancy: job.no_vacancy,
        hired_total: job.hired_total,
        JobState: job.JobState
          ? {
              id: job.JobState.id || null,
              state_english: job.JobState.state_english || null,
              state_hindi: job.JobState.state_hindi || null,
            }
          : null,
        job_state: job.JobState?.state_english || null,
        job_state_english: job.JobState?.state_english || null,
        job_state_hindi: job.JobState?.state_hindi || null,
        JobCity: job.JobCity
          ? {
              id: job.JobCity.id || null,
              city_english: job.JobCity.city_english || null,
              city_hindi: job.JobCity.city_hindi || null,
            }
          : null,
        job_city: job.JobCity?.city_english || null,
        job_city_english: job.JobCity?.city_english || null,
        job_city_hindi: job.JobCity?.city_hindi || null,
        is_expired: isExpired,
        job_status: isExpired ? "expired" : "active",
        job_life: jobLife(job.created_at),
        created_at: job.created_at,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Recommended jobs fetched successfully",
      data,
    });
  } catch (error) {
    console.error("[app/jobs/recommended/:employeeId]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_03",
      message: error.message || "Failed to fetch recommended jobs",
      data: null,
    });
  }
}

module.exports = {  verifyInterviewerContactOtpForJob,
  sendInterviewerContactOtpForJob,

  getRecommendedJobs,
};
