const { sendApiResponse } = require('../_helpers/response');

const { sequelize } = require('../../config/db');
const Sequelize = require('sequelize');
const { Op } = Sequelize;

const {
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
  State,
  City,
  Employee,
} = require('../../models');

const Wishlist = require('../../models/Wishlist');
const EmployeeContact = require('../../models/EmployeeContact');

const SUCCESS_CODE = 'SC_01';

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
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseIdList(value) {
  if (value === null || value === undefined || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  for (const v of raw) {
    if (v === null || v === undefined) continue;
    const parts = typeof v === 'string' ? v.split(',') : [String(v)];
    for (const partRaw of parts) {
      const part = String(partRaw || '').trim();
      if (!part) continue;
      const n = Number(part);
      if (Number.isInteger(n) && n > 0) out.push(n);
    }
  }
  return Array.from(new Set(out));
}

function parseRangeList(value) {
  if (value === null || value === undefined || value === '') return [];

  const push = (ranges, minVal, maxVal) => {
    if (minVal === null && maxVal === null) return;
    ranges.push({ min: minVal, max: maxVal });
  };

  const ranges = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object') {
        push(ranges, toFloat(item.min), toFloat(item.max));
      }
    }
    return ranges;
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && typeof item === 'object') {
          push(ranges, toFloat(item.min), toFloat(item.max));
        }
      }
      return ranges;
    } catch (_e) {
      // fall through
    }
  }

  const parts = text.split(',').map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf('-');
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
  const g = String(value || '').trim().toLowerCase();
  if (g === 'male' || g === 'female' || g === 'any') return g;
  return null;
}

function isExpiredJobRow(job) {
  if (String(job?.status || '').toLowerCase() === 'expired') return true;
  if (!job?.expired_at) return false;

  const expiry = new Date(job.expired_at);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() <= Date.now();
}

function uniqueJoined(values) {
  const items = Array.from(new Set((values || []).filter(Boolean)));
  return items.length ? items.join(', ') : null;
}

async function getAllJobs(req, res) {
  try {
    const input = (req.method === 'POST' && req.body && Object.keys(req.body).length)
      ? req.body
      : (req.query || {});
    const search = String(input?.search || '').trim();

    const jobProfileIds = parseIdList(input?.job_profile_ids || input?.job_profile_id);
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

    const verificationFilter = String(input?.verification || input?.verification_status || '').trim().toLowerCase();
    const genderFilter = normalizeGender(input?.gender);

    let originLat = null;
    let originLng = null;
    const employeeIdForDistance = toInt(input?.employee_id || input?.employeeId);
    const queryLat = toFloat(input?.lat);
    const queryLng = toFloat(input?.lng);

    if (distanceRanges.length) {
      // Prefer request-provided lat/lng (query or body) if present.
      if (queryLat !== null && queryLng !== null) {
        originLat = queryLat;
        originLng = queryLng;
      } else if (employeeIdForDistance) {
        const emp = await Employee.findByPk(employeeIdForDistance, {
          attributes: ['id', 'lat', 'lng'],
          paranoid: false,
        });
        originLat = toFloat(emp?.lat);
        originLng = toFloat(emp?.lng);
        if (originLat === null || originLng === null) {
          return sendApiResponse(res, {
            ok: false,
            code: 'FC_01',
            message: 'Distance filtering requires employee lat/lng (or lat/lng in request)',
            data: null,
          });
        }
      } else {
        return sendApiResponse(res, {
          ok: false,
          code: 'FC_01',
          message: 'Distance filtering requires lat/lng (or employee_id) to compute distance',
          data: null,
        });
      }
    }

    const page = Math.max(toInt(input?.page) || 1, 1);
    const limit = Math.min(Math.max(toInt(input?.limit) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const where = {};
    const and = [];

    if (jobProfileIds.length) where.job_profile_id = { [Op.in]: jobProfileIds };
    if (salaryTypeIds.length) where.salary_type_id = { [Op.in]: salaryTypeIds };

    where.verification_status = 'approved';

    if (stateIds.length) {
      and.push({
        [Op.or]: [
          { job_state_id: { [Op.in]: stateIds } },
          { '$Employer.state_id$': { [Op.in]: stateIds } },
        ],
      });
    }

    if (cityIds.length) {
      and.push({
        [Op.or]: [
          { job_city_id: { [Op.in]: cityIds } },
          { '$Employer.city_id$': { [Op.in]: cityIds } },
        ],
      });
    }

    if (businessCategoryIds.length) {
      and.push({ '$Employer.business_category_id$': { [Op.in]: businessCategoryIds } });
    }

    if (verificationFilter === 'verified') {
      and.push(
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.fn('COALESCE', Sequelize.col('Employer.kyc_status'), '')),
          { [Op.eq]: 'verified' }
        )
      );
    } else if (verificationFilter === 'not_verified') {
      and.push(
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.fn('COALESCE', Sequelize.col('Employer.kyc_status'), '')),
          { [Op.ne]: 'verified' }
        )
      );
    }


    const jobSkillsInclude = {
      model: JobSkill,
      as: 'JobSkills',
      attributes: ['skill_id'],
      required: false,
      include: [{ model: Skill, as: 'Skill', attributes: ['skill_english'], required: false }],
    };
    if (skillIds.length) {
      jobSkillsInclude.required = true;
      jobSkillsInclude.where = { skill_id: { [Op.in]: skillIds } };
    }

    const jobQualificationsInclude = {
      model: JobQualification,
      as: 'JobQualifications',
      attributes: ['qualification_id'],
      required: false,
      include: [{ model: Qualification, as: 'Qualification', attributes: ['qualification_english'], required: false }],
    };
    if (qualificationIds.length) {
      jobQualificationsInclude.required = true;
      jobQualificationsInclude.where = { qualification_id: { [Op.in]: qualificationIds } };
    }

    const jobShiftsInclude = {
      model: JobShift,
      as: 'JobShifts',
      attributes: ['shift_id'],
      required: false,
      include: [{ model: Shift, as: 'Shift', attributes: ['shift_english'], required: false }],
    };
    if (shiftIds.length) {
      jobShiftsInclude.required = true;
      jobShiftsInclude.where = { shift_id: { [Op.in]: shiftIds } };
    }

    const jobExperiencesInclude = {
      model: JobExperience,
      as: 'JobExperiences',
      attributes: ['experience_id'],
      required: false,
      include: [{ model: Experience, as: 'Experience', attributes: ['title_english', 'exp_from', 'exp_to'], required: false }],
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

    const includeExpired = String(input?.include_expired || '').trim().toLowerCase() === 'true';
    if (!includeExpired) {
      and.push({
        status: 'active',
        [Op.or]: [
          { expired_at: { [Op.is]: null } },
          { expired_at: { [Op.gt]: new Date() } },
        ],
      });
    }

    if (search) {
      const like = sequelize.escape('%' + search.toLowerCase() + '%');
      const jpEnglish = `(SELECT \`jp\`.\`profile_english\` FROM \`job_profiles\` \`jp\` WHERE \`jp\`.\`id\` = \`Job\`.\`job_profile_id\` AND \`jp\`.\`deleted_at\` IS NULL LIMIT 1)`;
      const jpHindi = `(SELECT \`jp\`.\`profile_hindi\` FROM \`job_profiles\` \`jp\` WHERE \`jp\`.\`id\` = \`Job\`.\`job_profile_id\` AND \`jp\`.\`deleted_at\` IS NULL LIMIT 1)`;
      and.push(Sequelize.literal(`(
        LOWER(COALESCE(${jpEnglish}, '')) LIKE ${like}
        OR LOWER(COALESCE(${jpHindi}, '')) LIKE ${like}
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

    if (genderFilter && genderFilter !== 'any') {
      const genderEscaped = sequelize.escape(genderFilter);
      and.push(
        Sequelize.literal(
          '(' +
            ' NOT EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id)' +
            ' OR EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id AND LOWER(jg.gender) = \'any\')' +
            ' OR EXISTS (SELECT 1 FROM job_genders jg WHERE jg.job_id = Job.id AND LOWER(jg.gender) = ' + genderEscaped + ')' +
          ')'
        )
      );
    }

    let distanceKmExpr = null;
    if (distanceRanges.length) {
      and.push({ lat: { [Op.ne]: null }, lng: { [Op.ne]: null } });

      const oLat = Number(originLat);
      const oLng = Number(originLng);
      distanceKmExpr = Sequelize.literal(
        '(6371 * ACOS(LEAST(1, GREATEST(-1,' +
          ' COS(RADIANS(' + oLat + '))' +
          ' * COS(RADIANS(Job.lat))' +
          ' * COS(RADIANS(Job.lng) - RADIANS(' + oLng + '))' +
          ' + SIN(RADIANS(' + oLat + ')) * SIN(RADIANS(Job.lat))' +
        '))))'
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

    if (and.length) where[Op.and] = and;

    const { count, rows } = await Job.findAndCountAll({
      where,
      attributes: [
        'id',
        'slug',
        'employer_id',
        'job_profile_id',
        'is_household',
        'interviewer_contact',
        'work_start_time',
        'work_end_time',
        'salary_min',
        'salary_max',
        'salary_type_id',
        'no_vacancy',
        'hired_total',
        'status',
        'verification_status',
        'show_organization',
        'job_state_id',
        'job_city_id',
        'lat',
        'lng',
        'created_at',
        'expired_at',
      ],
      include: [
        {
          model: Employer,
          as: 'Employer',
          attributes: ['id', 'name', 'name_hindi', 'organization_name', 'organization_name_hindi', 'organization_type', 'state_id', 'city_id', 'business_category_id', 'kyc_status'],
          where: { verification_status: 'verified' },
          required: true,
          include: [{ model: User, as: 'User', attributes: ['mobile'], where: { is_active: 1 }, required: true }],
        },
        { model: JobProfile, as: 'JobProfile', attributes: ['id', 'profile_english', 'profile_hindi'], required: false },
        { model: SalaryType, as: 'SalaryType', attributes: ['id', 'type_english', 'type_hindi'], required: false },
        { model: JobGender, as: 'JobGenders', attributes: ['gender'], required: false },
        jobExperiencesInclude,
        jobQualificationsInclude,
        jobShiftsInclude,
        jobSkillsInclude,
        { model: State, as: 'JobState', attributes: ['id', 'state_english', 'state_hindi'], required: false },
        { model: City, as: 'JobCity', attributes: ['id', 'city_english', 'city_hindi'], required: false },
      ],
      distinct: true,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const jobIds = (rows || []).map((j) => j.id).filter(Boolean);

    let wishlistedJobIds = new Set();
    const employeeIdForWishlist = employeeIdForDistance && employeeIdForDistance > 0 ? employeeIdForDistance : null;
    if (employeeIdForWishlist && jobIds.length) {
      const wishlistRows = await Wishlist.findAll({
        where: { employee_id: employeeIdForWishlist, job_id: { [Op.in]: jobIds } },
        attributes: ['job_id'],
      });
      wishlistedJobIds = new Set((wishlistRows || []).map((r) => r.job_id).filter(Boolean));
    }

    // Check which jobs the employee has unlocked employer contact for (employee paid credits)
    let unlockedJobIds = new Set();
    if (employeeIdForWishlist && jobIds.length) {
      const contactRows = await EmployeeContact.findAll({
        where: { employee_id: employeeIdForWishlist, job_id: { [Op.in]: jobIds } },
        attributes: ['job_id'],
        paranoid: true,
      });
      unlockedJobIds = new Set((contactRows || []).map((r) => r.job_id).filter(Boolean));
    }

    const data = (rows || []).map((job) => {
      const employer = job.Employer || null;
      const employerPhone = employer?.User?.mobile || null;

      const genders = (job.JobGenders || []).map((g) => g.gender).filter(Boolean);
      const experiences = (job.JobExperiences || []).map((x) => x.Experience?.title_english).filter(Boolean);
      const qualifications = (job.JobQualifications || []).map((x) => x.Qualification?.qualification_english).filter(Boolean);
      const shifts = (job.JobShifts || []).map((x) => x.Shift?.shift_english).filter(Boolean);
      const skills = (job.JobSkills || []).map((x) => x.Skill?.skill_english).filter(Boolean);

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
        job_status: isExpired ? 'expired' : job.status,
        job_life: jobLife(job.created_at),
        created_at: job.created_at,
      };
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Jobs fetched successfully',
      data: {
        page,
        limit,
        total: count || 0,
        jobs: data,
      },
    });
  } catch (error) {
    console.error('[app/jobs]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_02',
      message: error.message || 'Failed to fetch jobs',
      data: null,
    });
  }
}

function formatTime12h(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr);
  const parts = s.split(':');
  if (parts.length < 2) return s;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  if (Number.isNaN(h)) return s;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + suffix;
}

function shiftTimingDisplay(start, end) {
  const a = formatTime12h(start);
  const b = formatTime12h(end);
  if (!a && !b) return null;
  if (a && b) return a + ' - ' + b;
  return a || b;
}

function jobLife(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  const days = Math.max(Math.floor(ms / 86400000), 0);
  return String(days) + ' ' + (days === 1 ? 'day' : 'days');
}

module.exports = {
  getAllJobs,
};
