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
    const search = (req.query.search || '').trim();
    const replacements = {};

    if (!fetchAll) {
      replacements.limit = limitValue;
      replacements.offset = offset;
    }

    const filters = [];
    if (status) {
      filters.push('ji.status = :status');
      replacements.status = status;
    }

    const parsedJobProfileId = parseInt(job_profile_id, 10);
    if (!Number.isNaN(parsedJobProfileId)) {
      filters.push('j.job_profile_id = :jobProfileId');
      replacements.jobProfileId = parsedJobProfileId;
    }

    if (search) {
      const loweredLike = `%${search.toLowerCase()}%`;
      filters.push(`(
        LOWER(COALESCE(e.name,'')) LIKE :searchLower
        OR LOWER(COALESCE(eu.mobile,'')) LIKE :searchRaw
        OR LOWER(COALESCE(er.name,'')) LIKE :searchLower
        OR LOWER(COALESCE(uer.mobile,'')) LIKE :searchRaw
        OR LOWER(COALESCE(jp.profile_english,'')) LIKE :searchLower
        OR LOWER(COALESCE(jp.profile_hindi,'')) LIKE :searchLower
        OR LOWER(COALESCE(j.description_english,'')) LIKE :searchLower
        OR LOWER(COALESCE(j.description_hindi,'')) LIKE :searchLower
      )`);
      replacements.searchLower = loweredLike;
      replacements.searchRaw = `%${search}%`;

      const numericSearch = Number(search);
      if (!Number.isNaN(numericSearch)) {
        filters.push('(ji.id = :searchNum OR e.id = :searchNum OR er.id = :searchNum OR j.id = :searchNum)');
        replacements.searchNum = numericSearch;
      }
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limitClause = fetchAll ? '' : 'LIMIT :limit OFFSET :offset';

    const baseSelect = `
      SELECT
        ji.id,
        ji.status,
        COALESCE(ji.updated_at, ji.created_at) AS hire_timestamp,
        ji.employee_id_resolved AS employee_id,
        ji.employer_id_resolved AS employer_id,
        ji.job_id,
        ji.otp,
        e.name AS employee_name,
        e.email AS employee_email,
        eu.mobile AS employee_mobile,
        er.name AS employer_name,
        uer.mobile AS employer_mobile,
        jp.profile_english AS job_profile_name,
        j.job_profile_id,
        j.interviewer_contact AS interviewer_mobile
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
      hired_at: row.hire_timestamp,
      otp: row.otp || null,
      employee: {
        id: row.employee_id,
        name: row.employee_name || '-',
        email: row.employee_email || null,
        mobile: row.employee_mobile || null,
      },
      employer: {
        id: row.employer_id,
        name: row.employer_name || '-',
        mobile: row.employer_mobile || null,
      },
      job: {
        id: row.job_id,
        profile_id: row.job_profile_id,
        profile_name: row.job_profile_name || '-',
        interviewer_mobile: row.interviewer_mobile || null,
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

module.exports = router;
