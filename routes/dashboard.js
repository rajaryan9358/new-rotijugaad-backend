const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const models = require('../models');
const Job = require('../models/Job');
const JobInterest = require('../models/JobInterest');

const { User, Employee, Employer } = models;
const PaymentHistory = models.PaymentHistory || require('../models/PaymentHistory');
const Referral = models.Referral || require('../models/Referral');
const Report = models.Report || require('../models/Report');


router.get('/', async (_req, res) => {
  try {
    const recentThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [
      totalUsers,
      totalEmployees,
      totalEmployers,
      verifiedEmployees,
      verifiedEmployers,
      activeEmployees,
      activeEmployers,
      kycVerifiedEmployees,
      kycVerifiedEmployers,
      pendingEmployees,
      pendingEmployers,
      pendingEmployeeKyc,
      pendingEmployerKyc,
      employeeDeleted,
      employerDeleted,
      employeeDeletionRequest,
      employerDeletionRequest,
      totalJobs,
      activeJobs,
      totalHired,
      totalShortlisted,
      totalSubscriptions,
      activeSubscriptions,
      totalReferrals,
      employeeReferrals,
      employerReferrals,
      totalAdsReported,
      totalProfileReported,
      newUsers,
      newEmployees,
      newEmployers,
      newJobs
    ] = await Promise.all([
      User.count(),
      Employee.count(),
      Employer.count(),
      Employee.count({ where: { verification_status: 'verified' } }),
      Employer.count({ where: { verification_status: 'verified' } }),
      User.count({ where: { user_type: 'employee', is_active: true } }),
      User.count({ where: { user_type: 'employer', is_active: true } }),
      Employee.count({ where: { kyc_status: 'verified' } }),
      Employer.count({ where: { kyc_status: 'verified' } }),
      Employee.count({ where: { verification_status: 'pending' } }),
      Employer.count({ where: { verification_status: 'pending' } }),
      Employee.count({ where: { kyc_status: 'pending' } }),
      Employer.count({ where: { kyc_status: 'pending' } }),
      User.count({
        paranoid: false,
        where: { user_type: 'employee', deleted_at: { [Op.ne]: null } }
      }),
      User.count({
        paranoid: false,
        where: { user_type: 'employer', deleted_at: { [Op.ne]: null } }
      }),
      User.count({ where: { user_type: 'employee', delete_pending: true } }),
      User.count({ where: { user_type: 'employer', delete_pending: true } }),
      Job.count(),
      Job.count({ where: { status: 'active' } }),
      JobInterest.count({ where: { status: 'hired' } }),
      JobInterest.count({ where: { status: 'shortlisted' } }),
      PaymentHistory.count({ where: { status: 'success' } }),
      PaymentHistory.count({
        where: {
          status: 'success',
          expiry_at: { [Op.gt]: new Date() }
        }
      }),
      Referral.count(),
      Referral.count({ where: { user_type: 'employee' } }),
      Referral.count({ where: { user_type: 'employer' } }),
      Report.count({ where: { report_type: 'job' } }),
      Report.count({ where: { report_type: 'employee' } }),
      User.count({ where: { created_at: { [Op.gte]: recentThreshold } } }),
      User.count({
        where: {
          user_type: 'employee',
          created_at: { [Op.gte]: recentThreshold }
        }
      }),
      User.count({
        where: {
          user_type: 'employer',
          created_at: { [Op.gte]: recentThreshold }
        }
      }),
      Job.count({ where: { created_at: { [Op.gte]: recentThreshold } } })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalEmployees,
        totalEmployers,
        verifiedEmployees,
        verifiedEmployers,
        activeEmployees,
        activeEmployers,
        kycVerifiedEmployees,
        kycVerifiedEmployers,
        pendingEmployees,
        pendingEmployers,
        pendingEmployeeKyc,
        pendingEmployerKyc,
        employeeDeleted,
        employerDeleted,
        employeeDeletionRequest,
        employerDeletionRequest,
        totalJobs,
        activeJobs,
        totalHired,
        totalShortlisted,
        totalSubscriptions,
        activeSubscriptions,
        totalReferrals,
        employeeReferrals,
        employerReferrals,
        totalAdsReported,
        totalProfileReported,
        newUsers,
        newEmployees,
        newEmployers,
        newJobs
      }
    });
  } catch (error) {
    console.error('[dashboard] error', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard metrics'
    });
  }
});

module.exports = router;
