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
const CallHistory = models.CallHistory || require('../models/CallHistory');

router.get('/', async (_req, res) => {
  try {
    const recentThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentFromDate = recentThreshold.toISOString().slice(0, 10);
    const recentToDate = new Date().toISOString().slice(0, 10);

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
      newJobs,

      // NEW: payment history created in last 48h
      newPaymentHistory,

      // NEW: job interests created in last 48h
      newJobInterests,

      // NEW: CallHistory counts split by user_type
      newEmployeeCallHistory,
      newEmployerCallHistory,

      // NEW: KYC verified employees in last 48h (based on kyc_verification_at) - powers Dashboard "Recent additions" card
      newKycVerifiedEmployees,

      // NEW: KYC verified employers in last 48h
      newKycVerifiedEmployers
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
      User.count({ where: { user_type: 'employee', created_at: { [Op.gte]: recentThreshold } } }),
      User.count({ where: { user_type: 'employer', created_at: { [Op.gte]: recentThreshold } } }),
      Job.count({ where: { created_at: { [Op.gte]: recentThreshold } } }),

      // NEW: payment history created in last 48h
      PaymentHistory.count({ where: { created_at: { [Op.gte]: recentThreshold } } }),

      // NEW
      JobInterest.count({ where: { created_at: { [Op.gte]: recentThreshold } } }),

      // NEW: Call history created in last 48h
      CallHistory?.count
        ? CallHistory.count({ where: { user_type: 'employee', created_at: { [Op.gte]: recentThreshold } } })
        : 0,
      CallHistory?.count
        ? CallHistory.count({ where: { user_type: 'employer', created_at: { [Op.gte]: recentThreshold } } })
        : 0,

      // NEW: KYC verified employees in last 48h
      Employee.count({
        where: {
          kyc_status: 'verified',
          kyc_verification_at: { [Op.gte]: recentThreshold }
        }
      }),

      // NEW: KYC verified employers in last 48h
      Employer.count({
        where: {
          kyc_status: 'verified',
          kyc_verification_at: { [Op.gte]: recentThreshold }
        }
      })
    ]);

    const newCallHistory = (Number(newEmployeeCallHistory) || 0) + (Number(newEmployerCallHistory) || 0);

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
        newJobs,

        // NEW
        newPaymentHistory,
        newJobInterests, // (was computed but not returned)

        // NEW: Call history
        newEmployeeCallHistory,
        newEmployerCallHistory,
        newCallHistory, // keep for compatibility

        // NEW: recent KYC verified employees
        newKycVerifiedEmployees,
        newKycVerifiedEmployers, // NEW

        recentWindow: { from: recentFromDate, to: recentToDate }
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

// NOTE: Employer verification_at is separate from kyc_verification_at; dashboard recent KYC uses the latter.
// NEW: KYC verified employees in last 48h (based on kyc_verification_at) - powers Dashboard "Recent additions" card
// NEW: KYC verified employers in last 48h

module.exports = router;
