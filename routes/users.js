const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');
const EmployeeExperience = require('../models/EmployeeExperience');
const EmployeeDocument = require('../models/EmployeeDocument');
const EmployeeContact = require('../models/EmployeeContact');
const EmployeeJobProfile = require('../models/EmployeeJobProfile');
const EmployerContact = require('../models/EmployerContact');
const JobInterest = require('../models/JobInterest');
const Job = require('../models/Job');
const Wishlist = require('../models/Wishlist');
const PaymentHistory = require('../models/PaymentHistory');
const CallHistory = require('../models/CallHistory');
const DeletedUser = require('../models/DeletedUser');
const markUserAsDeleted = require('../utils/markUserAsDeleted');
const getAdminId = require('../utils/getAdminId');
const Log = require('../models/Log');
const { deleteByUserId } = require('../utils/deleteUserTransactional');

// NEW: join users.status_change_by -> admins.id to show admin name in UsersManagement
const Admin = require('../models/Admin');

const LAST_ACTIVE_SINCE_OPTIONS = new Set([7, 15, 30, 90, 180, 365]);
const NEW_USER_WINDOW_MS = 48 * 60 * 60 * 1000;
const PERSISTED_USER_FIELDS = new Set(['id', 'name', 'mobile', 'user_type']);
const TIMESTAMP_FIELDS = ['created_at', 'updated_at'];
const SORTABLE_USER_FIELDS = new Set([
  'id',
  'mobile',
  'name',
  'user_type',
  'referral_code',
  'total_referred',
  'is_active',
  'created_at',
  'profile_completed_at'
]);
const STATUS_TARGETS = ['employee', 'employer'];

async function collectStatusUserIds(field, value, userType) {
  const normalizedType = (userType || '').toLowerCase();
  const targets = STATUS_TARGETS.includes(normalizedType) ? [normalizedType] : STATUS_TARGETS;
  const lookups = [];
  if (targets.includes('employee')) {
    lookups.push(Employee.findAll({ attributes: ['user_id'], where: { [field]: value }, paranoid: true }));
  }
  if (targets.includes('employer')) {
    lookups.push(Employer.findAll({ attributes: ['user_id'], where: { [field]: value }, paranoid: true }));
  }
  if (!lookups.length) return [];
  const rows = await Promise.all(lookups);
  return rows.flat().map(entry => entry.user_id);
}

// increase JSON/urlencoded size limits for this router
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ limit: '10mb', extended: true }));

const safeCreateLog = async (payload) => {
  try {
    await Log.create(payload);
  } catch (error) {
    console.error('[logs] failed to create log', error);
  }
};

const safeLog = async (req, { category, type, redirect_to, log_text }) => {
  return safeCreateLog({
    category,
    type,
    redirect_to: redirect_to || null,
    log_text: log_text || null,
    rj_employee_id: getAdminId(req),
  });
};

/**
 * GET /users/deletion-requests
 * List users who have pending deletion requests.
 */
router.get('/deletion-requests', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const userType = (req.query.user_type || '').toLowerCase();
    const newFilter = (req.query.newFilter || '').toLowerCase();

    const createdFromRaw = (req.query.created_from ?? req.query.createdFrom ?? '').toString().trim();
    const createdToRaw = (req.query.created_to ?? req.query.createdTo ?? '').toString().trim();

    const normalizeDateOnlyOrNull = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startOfDay = (d) => {
      if (!d) return null;
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const endExclusiveOfDay = (d) => {
      if (!d) return null;
      const x = startOfDay(d);
      x.setDate(x.getDate() + 1);
      return x;
    };

    const where = { delete_pending: true, deleted_at: { [Op.is]: null } };
    if (['employee', 'employer'].includes(userType)) where.user_type = userType;
    if (newFilter === 'new') {
      where.created_at = {
        ...(where.created_at || {}),
        [Op.gte]: new Date(Date.now() - NEW_USER_WINDOW_MS)
      };
    }

    const createdFrom = startOfDay(normalizeDateOnlyOrNull(createdFromRaw));
    const createdToExclusive = endExclusiveOfDay(normalizeDateOnlyOrNull(createdToRaw));
    if (createdFrom || createdToExclusive) {
      where.created_at = {
        ...(where.created_at || {}),
        ...(createdFrom ? { [Op.gte]: createdFrom } : {}),
        ...(createdToExclusive ? { [Op.lt]: createdToExclusive } : {})
      };
    }
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      const clauses = [{ name: like }, { mobile: like }];
      const numeric = Number(search);
      if (!Number.isNaN(numeric)) clauses.push({ id: numeric });
      where[Op.or] = clauses;
    }

    const users = await User.findAll({
      where,
      order: [['delete_requested_at', 'ASC']],
      paranoid: false
    });
    if (!users.length) return res.json({ success: true, data: [] });

    const userIds = users.map(u => u.id);
    const [employees, employers] = await Promise.all([
      Employee.findAll({ where: { user_id: userIds }, paranoid: false }),
      Employer.findAll({ where: { user_id: userIds }, paranoid: false })
    ]);
    const employeeByUser = new Map(employees.map(e => [e.user_id, e]));
    const employerByUser = new Map(employers.map(e => [e.user_id, e]));

    const data = users.map(u => ({
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      user_type: u.user_type,
      delete_requested_at: u.delete_requested_at,
      entity: u.user_type === 'employee'
        ? employeeByUser.get(u.id) || null
        : employerByUser.get(u.id) || null,
      created_at: u.created_at,
      last_active_at: u.last_active_at
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('[users:deletion-requests] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /users/deleted
 * Retrieve deleted users from deleted_users audit table.
 */
router.get('/deleted', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const userType = (req.query.user_type || '').toLowerCase();
    const newFilter = (req.query.newFilter || '').toLowerCase();

    const createdFromRaw = (req.query.created_from ?? req.query.createdFrom ?? '').toString().trim();
    const createdToRaw = (req.query.created_to ?? req.query.createdTo ?? '').toString().trim();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitParam || 200, 1), 500);
    const offset = (page - 1) * limit;

    const parseDateOnly = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const startOfDay = (d) => {
      if (!d) return null;
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    const endExclusiveOfDay = (d) => {
      if (!d) return null;
      const x = startOfDay(d);
      x.setDate(x.getDate() + 1);
      return x;
    };

    const createdFrom = parseDateOnly(createdFromRaw);
    const createdTo = parseDateOnly(createdToRaw);

    const where = {};
    if (['employee', 'employer'].includes(userType)) where.user_type = userType;

    if (newFilter === 'new') {
      where.created_at = {
        ...(where.created_at || {}),
        [Op.gte]: new Date(Date.now() - NEW_USER_WINDOW_MS)
      };
    }

    if (createdFrom) {
      where.created_at = {
        ...(where.created_at || {}),
        [Op.gte]: startOfDay(createdFrom)
      };
    }

    if (createdTo) {
      where.created_at = {
        ...(where.created_at || {}),
        [Op.lt]: endExclusiveOfDay(createdTo)
      };
    }

    if (search) {
      const like = { [Op.like]: `%${search}%` };
      const clauses = [
        { name: like },
        { mobile: like },
        { referred_by: like },
        { organization_type: like },
        { organization_name: like },
        { business_category: like },
        { email: like }
      ];
      const numeric = Number(search);
      if (!Number.isNaN(numeric)) clauses.push({ id: numeric });
      where[Op.or] = clauses;
    }

    const result = await DeletedUser.findAndCountAll({
      where,
      order: [['deleted_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset
    });

    const rawRows = (result.rows || []).map((row) => row.toJSON());

    // Attach DeletedBy (Admin) name.
    const adminIds = [...new Set(rawRows.map(r => Number(r.deleted_by)).filter(n => Number.isFinite(n) && n > 0))];
    let adminMap = new Map();
    if (adminIds.length) {
      const admins = await Admin.findAll({ where: { id: adminIds }, attributes: ['id', 'name'] });
      adminMap = new Map(admins.map(a => [a.id, a.name]));
    }

    const data = rawRows.map((r) => ({
      ...r,
      DeletedBy: r.deleted_by ? { id: r.deleted_by, name: adminMap.get(Number(r.deleted_by)) || null } : null
    }));

    const total = result.count || 0;
    const totalPages = limit ? Math.max(Math.ceil(total / limit), 1) : 1;

    res.json({
      success: true,
      data,
      meta: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('[users:deleted] error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /users/:id/delete-permanently
 * Accept deletion request and apply standard delete logic.
 */
router.post('/:id/delete-permanently', async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });

  const user = await User.findByPk(userId, { paranoid: false });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (!user.delete_pending) {
    return res.status(409).json({ success: false, message: 'User is not pending deletion' });
  }

  try {
    const adminId = getAdminId(req);
    await safeLog(req, {
      category: 'pending deletion',
      type: 'delete',
      redirect_to: '/users/deletion-requests',
      log_text: `Accepted deletion request and deleted user #${user.id} (${user.mobile || '-'})`,
    });
    await safeLog(req, {
      category: 'users',
      type: 'delete',
      redirect_to: '/users',
      log_text: `Deleted user (accepted pending deletion): #${user.id} (${user.mobile || '-'})`,
    });

    await deleteByUserId(userId, { deletedByAdminId: adminId ? Number(adminId) : undefined });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('[users:delete-permanently] error', error);
    const status = error?.status && Number.isFinite(error.status) ? error.status : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/**
 * GET /users
 * Fetch all users with their profile metadata.
 */
router.get('/', async (req, res) => {
  try {
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitParam || 25, 1), 500);
    const sortField = SORTABLE_USER_FIELDS.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const userTypeFilter = (req.query.user_type || '').toLowerCase();
    const statusFilter = (req.query.status || '').toLowerCase();
    const verificationFilter = (req.query.verification_status || '').toLowerCase();
    const kycFilter = (req.query.kyc_status || '').toLowerCase();
    const lastActiveSinceDays = parseInt(req.query.lastActiveSinceDays, 10);
    const search = (req.query.search || '').trim();
    const newFilter = (req.query.newFilter || '').toLowerCase();

    // NEW: created_at date range filter (accept snake_case and camelCase)
    const createdFromRaw = (req.query.created_from ?? req.query.createdFrom ?? '').toString().trim();
    const createdToRaw = (req.query.created_to ?? req.query.createdTo ?? '').toString().trim();

    // NEW: profile completion filter
    const profileCompletedFilter = (req.query.profile_completed || '').toString().trim().toLowerCase();

    const where = {};
    if (userTypeFilter) where.user_type = userTypeFilter;
    if (statusFilter === 'active') where.is_active = true;
    if (statusFilter === 'inactive') where.is_active = false;

    // NEW: apply profile completion filter
    if (profileCompletedFilter === 'completed') {
      where.profile_completed_at = { [Op.ne]: null };
    } else if (profileCompletedFilter === 'not_completed') {
      where.profile_completed_at = null;
    }

    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { mobile: like },
        { name: like },
        { user_type: like },
        { referral_code: like }
      ];
      if (!Number.isNaN(Number(search))) where[Op.or].push({ id: Number(search) });
    }
    if (LAST_ACTIVE_SINCE_OPTIONS.has(lastActiveSinceDays)) {
      const threshold = new Date(Date.now() - lastActiveSinceDays * 24 * 60 * 60 * 1000);
      where.last_active_at = { [Op.gte]: threshold };
    }

    const parseDateStartUtc = (value) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const parseDateEndUtc = (value) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(`${value}T23:59:59.999Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const createdFromDate = parseDateStartUtc(createdFromRaw);
    const createdToDate = parseDateEndUtc(createdToRaw);

    let createdAtConstraints = where.created_at || null;
    if (newFilter === 'new') {
      const threshold = new Date(Date.now() - NEW_USER_WINDOW_MS);
      createdAtConstraints = { ...(createdAtConstraints || {}), [Op.gte]: threshold };
    }
    if (createdFromDate) {
      const existing = createdAtConstraints?.[Op.gte];
      createdAtConstraints = {
        ...(createdAtConstraints || {}),
        [Op.gte]: existing ? new Date(Math.max(existing.getTime(), createdFromDate.getTime())) : createdFromDate
      };
    }
    if (createdToDate) {
      const existing = createdAtConstraints?.[Op.lte];
      createdAtConstraints = {
        ...(createdAtConstraints || {}),
        [Op.lte]: existing ? new Date(Math.min(existing.getTime(), createdToDate.getTime())) : createdToDate
      };
    }
    if (createdAtConstraints) where.created_at = createdAtConstraints;

    const emptyMeta = {
      page: fetchAll ? 1 : page,
      limit: fetchAll ? 0 : limit,
      total: 0,
      totalPages: 1
    };
    let constrainedIds = null;
    if (verificationFilter) {
      constrainedIds = new Set(await collectStatusUserIds('verification_status', verificationFilter, userTypeFilter));
      if (!constrainedIds.size) {
        return res.json({ success: true, data: [], meta: emptyMeta });
      }
    }
    if (kycFilter) {
      const kycIds = new Set(await collectStatusUserIds('kyc_status', kycFilter, userTypeFilter));
      constrainedIds = constrainedIds
        ? new Set([...constrainedIds].filter(id => kycIds.has(id)))
        : kycIds;
      if (!constrainedIds.size) {
        return res.json({ success: true, data: [], meta: emptyMeta });
      }
    }
    if (constrainedIds) {
      where.id = { [Op.in]: Array.from(constrainedIds) };
    }

    const queryOptions = {
      where,
      order: [[sortField, sortDir]],
      paranoid: true,

      // NEW: include StatusChangedBy (Admin) for "Status changed by" column in UI
      include: [
        {
          model: Admin,
          as: 'StatusChangedBy',
          attributes: ['id', 'name'],
          required: false
        }
      ],

      // Safety when includes are present
      distinct: true
    };
    if (!fetchAll) {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
    }

    const { rows, count } = await User.findAndCountAll(queryOptions);
    const userIds = rows.map(u => u.id);
    let employeeByUser = {};
    let employerByUser = {};
    if (userIds.length) {
      const [employees, employers] = await Promise.all([
        Employee.findAll({
          attributes: ['id', 'user_id', 'verification_status', 'kyc_status'],
          where: { user_id: userIds },
          paranoid: true
        }),
        Employer.findAll({
          attributes: ['id', 'user_id', 'verification_status', 'kyc_status'],
          where: { user_id: userIds },
          paranoid: true
        })
      ]);
      employeeByUser = employees.reduce((acc, emp) => {
        acc[emp.user_id] = emp;
        return acc;
      }, {});
      employerByUser = employers.reduce((acc, emp) => {
        acc[emp.user_id] = emp;
        return acc;
      }, {});
    }

    const data = rows.map(u => {
      const base = u.toListJSON ? u.toListJSON() : u.toJSON();
      const linkedEmployee = employeeByUser[base.id];
      const linkedEmployer = employerByUser[base.id];
      const normalizedType = (base.user_type || '').toLowerCase();
      const verificationStatus = normalizedType === 'employee'
        ? linkedEmployee?.verification_status ?? null
        : normalizedType === 'employer'
          ? linkedEmployer?.verification_status ?? null
          : linkedEmployee?.verification_status ?? linkedEmployer?.verification_status ?? null;
      const kycStatus = normalizedType === 'employee'
        ? linkedEmployee?.kyc_status ?? null
        : normalizedType === 'employer'
          ? linkedEmployer?.kyc_status ?? null
          : linkedEmployee?.kyc_status ?? linkedEmployer?.kyc_status ?? null;

      return {
        ...base,

        // NEW: expose joined admin (name) for UI column
        StatusChangedBy: base.StatusChangedBy ?? u.StatusChangedBy ?? null,

        profile_completed_at: base.profile_completed_at ?? u.profile_completed_at ?? null,
        employee_id: linkedEmployee ? linkedEmployee.id : null,
        has_employee_profile: !!linkedEmployee,
        employer_id: linkedEmployer ? linkedEmployer.id : null,
        has_employer_profile: !!linkedEmployer,
        verification_status: verificationStatus,
        kyc_status: kycStatus
      };
    });

    const totalPages = fetchAll ? 1 : Math.max(Math.ceil((count || 1) / limit), 1);
    res.json({
      success: true,
      data,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? data.length : limit,
        total: count,
        totalPages
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /users/:id
 * Fetch a single user by identifier.
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /users
 * Create a new user record.
 */
router.post('/', async (req, res) => {
  try {
    const {
      mobile,
      name,
      user_type,
      referral_code,
      referred_by,
      is_active
    } = req.body || {};

    if (!mobile) {
      return res.status(400).json({ success: false, message: 'Required field: mobile' });
    }

    // Pre-check for existing mobile to return a clearer message
    const existing = await User.findOne({ where: { mobile }, paranoid: false });
    if (existing) {
      if (existing.deleted_at) {
        await existing.restore();
        return res.status(409).json({ success: false, message: 'Mobile already exists and was restored. Please retry.' });
      }
      return res.status(409).json({ success: false, message: 'A user with this mobile already exists.' });
    }

    const user = await User.create({
      mobile,
      name: name || null,
      user_type: user_type || null,
      referral_code: referral_code || null,
      referred_by: referred_by || null,
      is_active: is_active !== undefined ? !!is_active : true
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error('User create error:', error);
    // Map unique constraint to field-based messages when possible
    if (error.name === 'SequelizeUniqueConstraintError') {
      const fields = Object.keys(error.fields || {});
      const field = fields[0];
      const msg = field === 'mobile'
        ? 'A user with this mobile already exists.'
        : field === 'referral_code'
          ? 'Referral code already in use.'
          : 'Duplicate value for a unique field.';
      return res.status(409).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /users/:id
 * Update a user record with provided fields.
 */
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    const wasDeletePending = !!user.delete_pending;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const payload = { ...req.body };

    if (payload.is_active !== undefined) payload.is_active = !!payload.is_active;
    if (payload.delete_pending !== undefined) payload.delete_pending = !!payload.delete_pending;
    ['name','user_type','referral_code','referred_by'].forEach(f => {
      if (payload[f] === '') payload[f] = null;
    });
    // strip removed fields if sent by older clients
    delete payload.verification_status;
    delete payload.kyc_status;

    // If activation status is being changed, stamp the admin who performed the change.
    if (payload.is_active !== undefined || payload.deactivation_reason !== undefined) {
      const adminId = getAdminId(req);
      if (adminId) payload.status_change_by = adminId;
    }


    const requestedDeletePendingClear = payload.delete_pending === false;
    const requestedDeleteRequestedAtClear = (
      Object.prototype.hasOwnProperty.call(payload, 'delete_requested_at') && (payload.delete_requested_at === null || payload.delete_requested_at === '')
    ) || (
      Object.prototype.hasOwnProperty.call(payload, 'deletion_requested_at') && (payload.deletion_requested_at === null || payload.deletion_requested_at === '')
    );

    if (wasDeletePending && requestedDeletePendingClear && requestedDeleteRequestedAtClear) {
      await safeLog(req, {
        category: 'pending deletion',
        type: 'update',
        log_text: `Revoked deletion request for user #${user.id} (${user.mobile || '-'})`,
        redirect_to: '/users/deletion-requests',
      });
    }


    await user.update(payload);
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('User update error:', error);
    const status = /unique/i.test(error.message) ? 409 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /users/:id/status
 * Toggle the activation status of a user.
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'is_active must be boolean' });
    }

    const reason = (req.body?.deactivation_reason || '').toString().trim();
    if (is_active === false && !reason) {
      return res.status(400).json({ success: false, message: 'deactivation_reason is required when deactivating' });
    }

    const user = await User.findByPk(req.params.id, { paranoid: false });
    const previousIsActive = !!user?.is_active;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const adminId = getAdminId(req);

    // IMPORTANT: don't overwrite status_change_by with null when admin id isn't available
    const updatePayload = {
      is_active,
      deactivation_reason: is_active ? null : reason,
      ...(adminId ? { status_change_by: adminId } : {})
    };

    if (previousIsActive !== !!is_active) {
      await safeLog(req, {
        category: 'users',
        type: 'update',
        redirect_to: '/users',
        log_text: is_active
          ? `User activated: #${user.id} (${user.mobile || '-'})`
          : `User deactivated: #${user.id} (${user.mobile || '-'})${reason ? ` (Reason: ${reason})` : ''}`,
      });
    }


    await user.update(updatePayload);

    return res.json({ success: true, data: user });
  } catch (error) {
    console.error('[Users] status update error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to update status' });
  }
});


/**
 * GET /users/:id/check
 * Debug endpoint returning raw user data (including soft-deleted).
 */
router.get('/:id/check', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { paranoid: false });
    const previousIsActive = !!user?.is_active;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('[Users] check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /users/:id
 * Soft delete a user account.
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = Number.isFinite(userId) ? await User.findByPk(userId, { paranoid: false }) : null;

    const adminId = getAdminId(req);
    await deleteByUserId(req.params.id, { deletedByAdminId: adminId ? Number(adminId) : undefined });

    if (user) {
      await safeLog(req, {
        category: 'users',
        type: 'delete',
        redirect_to: '/users',
        log_text: `User deleted: #${user.id} (${user.mobile || '-'})`,
      });
    }

    return res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('[Users] delete error:', error);
    const status = error?.status && Number.isFinite(error.status) ? error.status : 500;
    return res.status(status).json({ success: false, message: error.message || 'Delete failed' });
  }
});

module.exports = router;
