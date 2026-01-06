const express = require('express');
const { sequelize } = require('../config/db');

const router = express.Router();

/**
 * GET /hired-employees
 * Fetch a paginated list of hired employees.
 */
router.get('/', async (req, res) => {
  try {
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limitValue = Math.min(Math.max(limitParam || 25, 1), 500);
    const limit = fetchAll ? undefined : limitValue;
    const offset = fetchAll ? 0 : (page - 1) * limitValue;

    const { status, job_profile_id } = req.query;
    const senderTypeRaw = String(req.query.sender_type || '').trim().toLowerCase(); // NEW
    const senderType = (senderTypeRaw === 'employee' || senderTypeRaw === 'employer') ? senderTypeRaw : ''; // NEW

    const search = (req.query.search || '').trim();
    const createdFromRaw = String(req.query.created_from || '').trim(); // YYYY-MM-DD
    const createdToRaw = String(req.query.created_to || '').trim();     // YYYY-MM-DD
    const replacements = {};

    if (!fetchAll) {
      replacements.limit = limitValue;
      replacements.offset = offset;
    }

    const filters = [];
    // NEW: sender_type filter (employee/employer)
    if (senderType) {
      filters.push('ji.sender_type = :senderType');
      replacements.senderType = senderType;
    }

    if (status) {
      filters.push('ji.status = :status');
      replacements.status = status;
    }

    const parsedJobProfileId = parseInt(job_profile_id, 10);
    if (!Number.isNaN(parsedJobProfileId)) {
      filters.push('j.job_profile_id = :jobProfileId');
      replacements.jobProfileId = parsedJobProfileId;
    }

    // created_at date range filters (job_interests.created_at via ji.created_at)
    const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const nextDayYmd = (ymd) => {
      const d = new Date(`${ymd}T00:00:00`);
      if (Number.isNaN(d.getTime())) return null;
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    };

    if (createdFromRaw && isDateOnly(createdFromRaw)) {
      filters.push('ji.created_at >= :createdFrom');
      replacements.createdFrom = `${createdFromRaw} 00:00:00`;
    }
    if (createdToRaw && isDateOnly(createdToRaw)) {
      const ymdExclusive = nextDayYmd(createdToRaw);
      if (ymdExclusive) {
        filters.push('ji.created_at < :createdToExclusive');
        replacements.createdToExclusive = `${ymdExclusive} 00:00:00`;
      }
    }
    if (search) {
      const loweredLike = `%${search.toLowerCase()}%`;
      const searchRaw = `%${search}%`;

      const orParts = [
        "LOWER(COALESCE(e.name,'')) LIKE :searchLower",
        "COALESCE(eu.mobile,'') LIKE :searchRaw",
        "LOWER(COALESCE(er.name,'')) LIKE :searchLower",
        "COALESCE(uer.mobile,'') LIKE :searchRaw",
        "LOWER(COALESCE(jp.profile_english,'')) LIKE :searchLower",
        "LOWER(COALESCE(jp.profile_hindi,'')) LIKE :searchLower",
        "LOWER(COALESCE(j.description_english,'')) LIKE :searchLower",
        "LOWER(COALESCE(j.description_hindi,'')) LIKE :searchLower",
        "LOWER(COALESCE(je.organization_name,'')) LIKE :searchLower",
        "COALESCE(j.interviewer_contact,'') LIKE :searchRaw"
      ];

      const numericSearch = Number(search);
      if (!Number.isNaN(numericSearch)) {
        orParts.push('ji.id = :searchNum', 'e.id = :searchNum', 'er.id = :searchNum', 'j.id = :searchNum');
        replacements.searchNum = numericSearch;
      }

      filters.push('(' + orParts.join(' OR ') + ')');
      replacements.searchLower = loweredLike;
      replacements.searchRaw = searchRaw;
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limitClause = fetchAll ? '' : 'LIMIT :limit OFFSET :offset';

    const baseSelect = `
      SELECT
        ji.id,
        ji.status,
        ji.created_at AS contact_date,
        COALESCE(ji.updated_at, ji.created_at) AS hire_timestamp,
        ji.employee_id_resolved AS employee_id,
        ji.employer_id_resolved AS employer_id,
        ji.job_id,
        ji.otp,
        e.name AS employee_name,
        e.email AS employee_email,
        e.verification_status AS employee_profile_status,
        eu.mobile AS employee_mobile,
        er.name AS employer_name,
        uer.mobile AS employer_mobile,
        jp.profile_english AS job_profile_name,
        j.job_profile_id,
        j.status AS job_status,
        j.interviewer_contact AS interviewer_mobile,
        j.salary_min,
        j.salary_max,
        je.organization_name AS job_employer_organization_name
      FROM (
        SELECT
          job_interests.*,
          CASE
            WHEN job_interests.sender_type = 'employee' THEN job_interests.sender_id
            ELSE job_interests.receiver_id
          END AS employee_id_resolved,
          CASE
            WHEN job_interests.sender_type = 'employee' THEN job_interests.receiver_id
            ELSE job_interests.sender_id
          END AS employer_id_resolved
        FROM job_interests
      ) ji
      LEFT JOIN employees e ON e.id = ji.employee_id_resolved
      LEFT JOIN users eu ON eu.id = e.user_id
      LEFT JOIN employers er ON er.id = ji.employer_id_resolved
      LEFT JOIN users uer ON uer.id = er.user_id
      LEFT JOIN jobs j ON j.id = ji.job_id
      LEFT JOIN employers je ON je.id = j.employer_id
      LEFT JOIN job_profiles jp ON jp.id = j.job_profile_id
      ${whereClause}
    `;

    const dataQuery = `
      ${baseSelect}
      ORDER BY COALESCE(ji.updated_at, ji.created_at) DESC, ji.id DESC
      ${limitClause}
    `;
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        ${baseSelect}
      ) AS counted
    `;

    const [rows] = await sequelize.query(dataQuery, { replacements });
    const [[{ total }]] = await sequelize.query(countQuery, { replacements });
    const totalCount = fetchAll ? rows.length : total;

    const data = rows.map((row) => ({
      id: row.id,
      status: row.status,
      contact_date: row.contact_date,
      hired_at: row.hire_timestamp,
      otp: row.otp || null,
      employee: {
        id: row.employee_id,
        name: row.employee_name || '-',
        email: row.employee_email || null,
        mobile: row.employee_mobile || null,
        profile_status: row.employee_profile_status || null
      },
      employer: {
        id: row.employer_id,
        name: row.employer_name || '-',
        mobile: row.employer_mobile || null,
      },
      job: {
        id: row.job_id,
        status: row.job_status || null,
        profile_id: row.job_profile_id,
        profile_name: row.job_profile_name || '-',
        interviewer_mobile: row.interviewer_mobile || null,
        employer_organization_name: row.job_employer_organization_name || null,
        salary_min: row.salary_min ?? null,
        salary_max: row.salary_max ?? null,
      },
    }));

    return res.json({
      success: true,
      data,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? data.length : limitValue,
        total: totalCount,
        totalPages: fetchAll ? 1 : Math.max(Math.ceil((totalCount || 1) / limitValue), 1)
      }
    });
  } catch (error) {
    console.error('[hired-employees] fetch failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load hired employees' });
  }
});

// NOTE: No changes required here for "separate column" or "₹" (handled in UI).
// Kept as-is, since it already selects:
//   je.organization_name AS job_employer_organization_name
//   j.salary_min, j.salary_max

module.exports = router;
