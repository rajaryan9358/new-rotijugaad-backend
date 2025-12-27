const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const models = require('../models');
const { authenticate } = require('../middleware/auth');
const Log = require('../models/Log');
const getAdminId = require('../utils/getAdminId');

const safeCreateLog = async (payload) => {
  try {
    if (!Log) return;
    await Log.create(payload);
  } catch (e) {
    // never break main flows for logging
  }
};


const loadModel = (key, path) => {
  if (models[key]) return models[key];
  try { return require(path); }
  catch { return null; }
};

const Report = loadModel('Report', '../models/Report');
const Employee = loadModel('Employee', '../models/Employee');
const Employer = loadModel('Employer', '../models/Employer');
const User = loadModel('User', '../models/User');
const Job = loadModel('Job', '../models/Job');
const JobProfile = loadModel('JobProfile', '../models/JobProfile');
const EmployeeReportReason = loadModel('EmployeeReportReason', '../models/EmployeeReportReason');
const EmployerReportReason = loadModel('EmployerReportReason', '../models/EmployerReportReason');


const MAP_SORT_FIELDS = new Set(['id', 'created_at', 'report_type', 'read_at']);

const fetchReasons = async () => ({ // helper keeps lookups cached per request
  employees: new Map(),
  employers: new Map()
});

/**
 * GET /api/reports
 * List reports with optional filters.
 */
router.get('/', async (req, res) => {
  try {
    if (!Report) return res.status(500).json({ success: false, message: 'Report model unavailable' });

    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = fetchAll ? undefined : Math.min(Math.max(limitParam || 25, 1), 200);
    const sortField = MAP_SORT_FIELDS.has(req.query.sortField) ? req.query.sortField : 'id';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const where = {};
    const rawReportType = (req.query.report_type || '').toLowerCase();
    const normalizedReportType =
      rawReportType === 'ads' ? 'job'
      : rawReportType === 'job' ? 'job'
      : rawReportType === 'employee' ? 'employee'
      : '';
    if (normalizedReportType) where.report_type = normalizedReportType;
    if (req.query.reason_id) where.reason_id = parseInt(req.query.reason_id, 10);
    if (req.query.user_id) where.user_id = parseInt(req.query.user_id, 10);
    if (req.query.report_id) {
      const reportId = parseInt(req.query.report_id, 10);
      if (!Number.isNaN(reportId)) where.report_id = reportId;
    }


    const readStatus = (req.query.read_status || '').toLowerCase();
    if (readStatus === 'read') where.read_at = { [Op.ne]: null };
    if (readStatus === 'unread') where.read_at = { [Op.is]: null };

    const searchRaw = (req.query.search || '').trim();
    if (searchRaw) {
      const lowered = searchRaw.toLowerCase();
      const likeValue = `%${lowered}%`;
      const searchClauses = [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('description')),
          { [Op.like]: likeValue }
        )
      ];
      const numeric = Number(searchRaw);
      if (!Number.isNaN(numeric)) {
        searchClauses.push({ id: numeric }, { report_id: numeric }, { user_id: numeric });
      }

      const employeeNamePromise = Employee
        ? Employee.findAll({
            attributes: ['id'],
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              { [Op.like]: likeValue }
            ),
            paranoid: true
          })
        : Promise.resolve([]);
      const employerNamePromise = Employer
        ? Employer.findAll({
            attributes: ['id'],
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              { [Op.like]: likeValue }
            ),
            paranoid: true
          })
        : Promise.resolve([]);
      const employeeReasonPromise = EmployeeReportReason
        ? EmployeeReportReason.findAll({
            attributes: ['id'],
            where: {
              [Op.or]: [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('reason_english')), { [Op.like]: likeValue }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('reason_hindi')), { [Op.like]: likeValue })
              ]
            },
            paranoid: true
          })
        : Promise.resolve([]);
      const employerReasonPromise = EmployerReportReason
        ? EmployerReportReason.findAll({
            attributes: ['id'],
            where: {
              [Op.or]: [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('reason_english')), { [Op.like]: likeValue }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('reason_hindi')), { [Op.like]: likeValue })
              ]
            },
            paranoid: true
          })
        : Promise.resolve([]);

      let jobIdMatches = [];
      if (Job) {
        const jobProfileRows = JobProfile
          ? await JobProfile.findAll({
              attributes: ['id'],
              where: {
                [Op.or]: [
                  sequelize.where(sequelize.fn('LOWER', sequelize.col('profile_english')), { [Op.like]: likeValue }),
                  sequelize.where(sequelize.fn('LOWER', sequelize.col('profile_hindi')), { [Op.like]: likeValue })
                ]
              },
              paranoid: true
            })
          : [];
        const jobProfileIds = jobProfileRows.map(row => row.id);
        const jobWhere = {
          [Op.or]: [
            sequelize.where(sequelize.fn('LOWER', sequelize.col('description_english')), { [Op.like]: likeValue }),
            sequelize.where(sequelize.fn('LOWER', sequelize.col('description_hindi')), { [Op.like]: likeValue })
          ]
        };
        if (jobProfileIds.length) {
          jobWhere[Op.or].push({ job_profile_id: { [Op.in]: jobProfileIds } });
        }
        const jobRows = await Job.findAll({
          attributes: ['id'],
          where: jobWhere,
          paranoid: true
        });
        jobIdMatches = jobRows.map(row => row.id);
      }

      const [
        employeeNameRows,
        employerNameRows,
        employeeReasonRows,
        employerReasonRows
      ] = await Promise.all([
        employeeNamePromise,
        employerNamePromise,
        employeeReasonPromise,
        employerReasonPromise
      ]);

      const employeeIds = employeeNameRows.map(row => row.id);
      if (employeeIds.length) {
        searchClauses.push({
          [Op.and]: [
            { report_type: 'job' },
            { user_id: { [Op.in]: employeeIds } }
          ]
        });
        searchClauses.push({
          [Op.and]: [
            { report_type: 'employee' },
            { report_id: { [Op.in]: employeeIds } }
          ]
        });
      }

      const employerIds = employerNameRows.map(row => row.id);
      if (employerIds.length) {
        searchClauses.push({
          [Op.and]: [
            { report_type: 'employee' },
            { user_id: { [Op.in]: employerIds } }
          ]
        });
      }

      if (jobIdMatches.length) {
        searchClauses.push({
          [Op.and]: [
            { report_type: 'job' },
            { report_id: { [Op.in]: jobIdMatches } }
          ]
        });
      }

      const employeeReasonIds = employeeReasonRows.map(row => row.id);
      if (employeeReasonIds.length) {
        searchClauses.push({
          [Op.and]: [
            { report_type: 'job' },
            { reason_id: { [Op.in]: employeeReasonIds } }
          ]
        });
      }

      const employerReasonIds = employerReasonRows.map(row => row.id);
      if (employerReasonIds.length) {
        searchClauses.push({
          [Op.and]: [
            { report_type: 'employee' },
            { reason_id: { [Op.in]: employerReasonIds } }
          ]
        });
      }

      where[Op.or] = searchClauses;
    }

    const queryOptions = {
      where,
      order: [[sortField, sortDir]],
      paranoid: true
    };
    if (!fetchAll) {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
    }

    const { rows, count } = await Report.findAndCountAll(queryOptions);
    const employeeIds = new Set();
    const employerIds = new Set();
    const jobIds = new Set();
    const employeeReasonIds = new Set();
    const employerReasonIds = new Set();

    rows.forEach((row) => {
      if (row.report_type === 'job') {
        if (row.user_id) employeeIds.add(row.user_id);
        if (row.report_id) jobIds.add(row.report_id);
        if (row.reason_id) employeeReasonIds.add(row.reason_id);
      } else if (row.report_type === 'employee') {
        if (row.user_id) employerIds.add(row.user_id);
        if (row.report_id) employeeIds.add(row.report_id);
        if (row.reason_id) employerReasonIds.add(row.reason_id);
      }
    });

    const [
      employees,
      employers,
      jobs,
      employeeReasons,
      employerReasons
    ] = await Promise.all([
      Employee && employeeIds.size ? Employee.findAll({ where: { id: [...employeeIds] }, paranoid: true }) : [],
      Employer && employerIds.size ? Employer.findAll({
        where: { id: [...employerIds] },
        include: User ? [{ model: User, as: 'User', attributes: ['id', 'is_active'], paranoid: false }] : [],
        paranoid: true
      }) : [],
      Job && jobIds.size ? Job.findAll({ where: { id: [...jobIds] }, paranoid: true }) : [],
      EmployeeReportReason && employeeReasonIds.size ? EmployeeReportReason.findAll({ where: { id: [...employeeReasonIds] }, paranoid: true }) : [],
      EmployerReportReason && employerReasonIds.size ? EmployerReportReason.findAll({ where: { id: [...employerReasonIds] }, paranoid: true }) : []
    ]);

    const jobProfileIds = jobs && JobProfile
      ? jobs.reduce((acc, job) => {
          if (job.job_profile_id) acc.add(job.job_profile_id);
          return acc;
        }, new Set())
      : new Set();
    const jobProfiles = jobProfileIds.size && JobProfile
      ? await JobProfile.findAll({ where: { id: [...jobProfileIds] }, paranoid: true })
      : [];

    const employeeMap = new Map(employees.map(e => [e.id, e]));
    const employerMap = new Map(employers.map(e => [e.id, e]));
    const reasonEmployeeMap = new Map(employeeReasons.map(r => [r.id, r]));
    const reasonEmployerMap = new Map(employerReasons.map(r => [r.id, r]));
    const jobProfileMap = new Map(jobProfiles.map(jp => [jp.id, jp]));
    const jobMap = new Map();
    jobs.forEach(job => {
      const plain = job.get ? job.get({ plain: true }) : job;
      if (plain.job_profile_id && jobProfileMap.has(plain.job_profile_id)) {
        plain.JobProfile = jobProfileMap.get(plain.job_profile_id);
      }
      jobMap.set(plain.id, plain);
    });

    rows.forEach(row => {
      const reportPlain = row;
      if (reportPlain.report_type === 'job') {
        reportPlain.setDataValue('reason', reasonEmployeeMap.get(reportPlain.reason_id) || null);
        reportPlain.setDataValue('reporter_entity', employeeMap.get(reportPlain.user_id) || null);
        reportPlain.setDataValue('reported_entity', jobMap.get(reportPlain.report_id) || null);
      } else if (reportPlain.report_type === 'employee') {
        reportPlain.setDataValue('reason', reasonEmployerMap.get(reportPlain.reason_id) || null);
        reportPlain.setDataValue('reporter_entity', employerMap.get(reportPlain.user_id) || null);
        reportPlain.setDataValue('reported_entity', employeeMap.get(reportPlain.report_id) || null);
      } else {
        reportPlain.setDataValue('reason', null);
        reportPlain.setDataValue('reporter_entity', null);
        reportPlain.setDataValue('reported_entity', null);
      }
    });

    res.json({
      success: true,
      data: rows,
      meta: {
        page: fetchAll ? 1 : page,
        limit: fetchAll ? rows.length : limit,
        total: count,
        totalPages: fetchAll ? 1 : Math.max(Math.ceil((count || 1) / limit), 1)
      }
    });
  } catch (error) {
    console.error('[reports] list error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load reports' });
  }
});

/**
 * GET /api/reports/:id
 * Fetch a single report with related entities.
 */
router.get('/:id', async (req, res) => {
  try {
    if (!Report) return res.status(500).json({ success: false, message: 'Report model unavailable' });
    const row = await Report.findByPk(req.params.id, { paranoid: true });
    if (!row) return res.status(404).json({ success: false, message: 'Report not found' });

    const listRes = await router.handle({ ...req, url: '/', method: 'GET', query: { report_id: row.id, limit: 1, page: 1 } }, {
      json: (payload) => res.json(payload),
      status: (code) => ({ json: (payload) => res.status(code).json(payload) })
    });
    return listRes;
  } catch (error) {
    console.error('[reports] detail error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load report' });
  }
});

// shared handler to mark report as read
const markReadHandler = async (req, res) => {
  try {
    if (!Report) return res.status(500).json({ success: false, message: 'Report model unavailable' });
    const row = await Report.findByPk(req.params.id, { paranoid: true });
    if (!row) return res.status(404).json({ success: false, message: 'Report not found' });
    let didMarkRead = false;
    if (!row.read_at) {
      await row.update({ read_at: new Date() });
      didMarkRead = true;
    }

    if (didMarkRead) {
      const adminId = getAdminId(req);
      const reportType = (row.report_type || '').toString().toLowerCase();
      const redirectTo = reportType === 'employee'
        ? `/employees/${row.report_id}`
        : reportType === 'job'
          ? `/jobs/${row.report_id}`
          : null;

      await safeCreateLog({
        category: 'voilation reports',
        type: 'update',
        redirect_to: redirectTo,
        log_text: `Report marked read: #${row.id} report_type=${row.report_type} report_id=${row.report_id}`,
        rj_employee_id: adminId,
      });

      if (reportType === 'employee') {
        await safeCreateLog({
          category: 'employee',
          type: 'update',
          redirect_to: redirectTo,
          log_text: `Employee violation report marked read: employee #${row.report_id} report #${row.id}`,
          rj_employee_id: adminId,
        });
      }

      if (reportType === 'job') {
        await safeCreateLog({
          category: 'jobs',
          type: 'update',
          redirect_to: redirectTo,
          log_text: `Job violation report marked read: job #${row.report_id} report #${row.id}`,
          rj_employee_id: adminId,
        });

        try {
          const job = Job ? await Job.findByPk(row.report_id, { paranoid: false }) : null;
          const employerId = job?.employer_id;
          if (employerId) {
            await safeCreateLog({
              category: 'employer',
              type: 'update',
              redirect_to: `/employers/${employerId}`,
              log_text: `Employer violation report marked read: employer #${employerId} report #${row.id} job #${row.report_id}`,
              rj_employee_id: adminId,
            });
          }
        } catch {
          // ignore join failures
        }
      }
    }

    res.json({ success: true, data: row });
  } catch (error) {
    console.error('[reports] read error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update report status' });
  }
};

/**
 * PATCH /api/reports/:id/mark-read
 * Mark a report as read.
 */
router.patch('/:id/mark-read', authenticate, markReadHandler);
// allow PUT for clients using PUT
router.put('/:id/mark-read', authenticate, markReadHandler);

/**
 * DELETE /api/reports/:id
 * Soft delete a report.
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!Report) return res.status(500).json({ success: false, message: 'Report model unavailable' });
    const row = await Report.findByPk(req.params.id, { paranoid: true });
    if (!row) return res.status(404).json({ success: false, message: 'Report not found' });
    await row.destroy();

    const adminId = getAdminId(req);
    await safeCreateLog({
      category: 'voilation reports',
      type: 'delete',
      redirect_to: '/violation-reports',
      log_text: `Deleted report: #${row.id} report_type=${row.report_type} report_id=${row.report_id} user_id=${row.user_id}`,
      rj_employee_id: adminId,
    });

    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    console.error('[reports] delete error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete report' });
  }
});

module.exports = router;
