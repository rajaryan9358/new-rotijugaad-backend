const router = require('express').Router();
const { Op } = require('sequelize');
const Review = require('../models/Review');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');
const Log = require('../models/Log');
const getAdminId = require('../utils/getAdminId');


const MAX_LIMIT = 100;
const EXPORT_LIMIT = 5000;

const deriveName = (entity) => {
  if (!entity) return '-';
  const fallback = [
    entity.name,
    entity.full_name,
    entity.business_name,
    entity.company_name,
    [entity.first_name, entity.last_name].filter(Boolean).join(' '),
  ].find((value) => value && value.trim());
  return fallback?.trim() || '-';
};

const safeLog = async (req, payload) => {
  try {
    const adminId = getAdminId(req);
    if (!adminId) return;
    await Log.create({
      ...payload,
      rj_employee_id: adminId,
    });
  } catch (e) {
    // never break main flows for logging
  }
};

const hydrateReviewerNames = async (rows) => {
  const employeeIds = rows.filter((r) => r.user_type === 'employee').map((r) => r.user_id);
  const employerIds = rows.filter((r) => r.user_type === 'employer').map((r) => r.user_id);

  const unique = (arr) => [...new Set(arr)];
  const employees = employeeIds.length
    ? await Employee.findAll({ where: { id: unique(employeeIds) } })
    : [];
  const employers = employerIds.length
    ? await Employer.findAll({ where: { id: unique(employerIds) } })
    : [];

  const employeeMap = new Map(employees.map((emp) => [emp.id, deriveName(emp)]));
  const employerMap = new Map(employers.map((emp) => [emp.id, deriveName(emp)]));

  return rows.map((row) => {
    const json = row.toJSON();
    const reviewer_name =
      row.user_type === 'employee'
        ? employeeMap.get(row.user_id) || '-'
        : employerMap.get(row.user_id) || '-';

    return {
      ...json,
      reviewer_name,
      reviewer_entity_id: row.user_id,
      reviewer_route:
        row.user_id
          ? (row.user_type === 'employee'
              ? `/employees/${row.user_id}`
              : `/employers/${row.user_id}`)
          : null,
    };
  });
};

const buildFilters = (query) => {
  const where = {};
  if (query.user_type) where.user_type = query.user_type;
  if (query.rating) where.rating = Number(query.rating);
  if (typeof query.is_read !== 'undefined') {
    const wantRead = query.is_read === true || query.is_read === 'true';
    where.read_at = wantRead ? { [Op.not]: null } : { [Op.is]: null };
  }
  if (query.search) {
    where[Op.or] = [{ review: { [Op.like]: `%${query.search.trim()}%` } }];
  }
  return where;
};

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
};

const buildSort = (query) => {
  const allowed = ['updated_at', 'rating', 'id'];
  const sortBy = allowed.includes(query.sort_by) ? query.sort_by : 'updated_at';
  const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC';
  return [sortBy, sortDir];
};

const toCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

router.get('/', async (req, res) => {
  try {
    const where = buildFilters(req.query);
    const { page, limit, offset } = parsePagination(req.query);
    const order = [buildSort(req.query)];

    const { rows, count } = await Review.findAndCountAll({ where, order, limit, offset });
    const enriched = await hydrateReviewerNames(rows);

    res.json({
      success: true,
      data: enriched,
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    console.error('[reviews:list]', error);
    res.status(500).json({ success: false, message: 'Unable to fetch reviews' });
  }
});

router.get('/export/csv', async (req, res) => {
  try {
    const where = buildFilters(req.query);
    const order = [buildSort(req.query)];
    const rows = await Review.findAll({ where, order, limit: EXPORT_LIMIT });
    const enriched = await hydrateReviewerNames(rows);

    const header = ['ID', 'User Type', 'Reviewer', 'Rating', 'Review', 'Read Status', 'Updated At'];
    const csv = [
      header.map(toCsvValue).join(','),
      ...enriched.map((review) =>
        [
          review.id,
          review.user_type,
          review.reviewer_name || '-',
          review.rating,
          review.review,
          review.read_at ? 'Read' : 'Unread',
          review.updated_at,
        ].map(toCsvValue).join(',')
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reviews.csv"');
    res.send(csv);
  } catch (error) {
    console.error('[reviews:export]', error);
    res.status(500).json({ success: false, message: 'Unable to export reviews' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    if (!review.read_at) {
      review.read_at = new Date();
      await review.save();

      const reviewer =
        review.user_type === 'employee'
          ? await Employee.findByPk(review.user_id, { paranoid: false })
          : await Employer.findByPk(review.user_id, { paranoid: false });
      const reviewerName = deriveName(reviewer);

      await safeLog(req, {
        category: 'reviews',
        type: 'update',
        redirect_to: '/reviews',
        log_text: `Review marked read: #${review.id} reviewer=${reviewerName} (${review.user_type || '-'}) rating=${review.rating ?? '-'}`
      });
    }
    res.json({ success: true, data: review });
  } catch (error) {
    console.error('[reviews:markRead]', error);
    res.status(500).json({ success: false, message: 'Unable to update review' });
  }
});

module.exports = router;
