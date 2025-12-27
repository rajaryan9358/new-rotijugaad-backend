const { sequelize } = require('../config/db');

const User = require('../models/User');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');
const BusinessCategory = require('../models/BusinessCategory');
const DeletedUser = require('../models/DeletedUser');

const EmployeeJobProfile = require('../models/EmployeeJobProfile');
const EmployeeExperience = require('../models/EmployeeExperience');
const EmployeeDocument = require('../models/EmployeeDocument');

const DELETED_USER_NAME = 'Deleted User';
const DELETED_ORG_NAME = 'Deleted Organization';

function daysBetween(start, end) {
  const startTs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endTs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return null;
  const diff = Math.floor((endTs - startTs) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

function tombstoneMobile(userId) {
  // IMPORTANT: users.mobile is unique + NOT NULL.
  // Using a unique tombstone prevents collisions across multiple deletes.
  return `-${userId}`;
}

async function snapshotAndDeleteUser({
  user,
  employee,
  employer,
  deletedByAdminId,
  transaction
}) {
  const deletedAt = new Date();

  const userType = (user?.user_type || (employee ? 'employee' : employer ? 'employer' : null) || '').toString();

  const email =
    userType === 'employee' ? (employee?.email ?? null) :
    userType === 'employer' ? (employer?.email ?? null) :
    null;

  const businessCategoryName =
    userType === 'employer'
      ? (employer?.BusinessCategory?.category_english || employer?.BusinessCategory?.category_hindi || null)
      : null;

  await DeletedUser.create({
    name: user?.name ?? employee?.name ?? employer?.name ?? null,
    mobile: user?.mobile ?? null,
    referred_by: user?.referred_by ?? null,
    deleted_by: Number.isFinite(deletedByAdminId) ? deletedByAdminId : null,
    user_type: userType || null,
    deleted_at: deletedAt,
    last_seen: user?.last_active_at ?? null,
    user_life: user?.created_at ? daysBetween(user.created_at, deletedAt) : null,

    organization_type: userType === 'employer' ? (employer?.organization_type ?? null) : null,
    organization_name: userType === 'employer' ? (employer?.organization_name ?? null) : null,
    business_category: businessCategoryName,
    email
  }, { transaction });

  if (employee) {
    await EmployeeJobProfile.destroy({
      where: { employee_id: employee.id },
      force: true,
      transaction
    });

    await EmployeeExperience.destroy({
      where: { user_id: employee.id },
      force: true,
      transaction
    });

    await EmployeeDocument.destroy({
      where: { user_id: employee.id },
      force: true,
      transaction
    });

    await employee.update({
      name: DELETED_USER_NAME,
      dob: null,
      email: '-',
      about_user: '-',
      aadhar_number: '-',
      selfie_link: null,
      deleted_at: deletedAt
    }, { paranoid: false, transaction });

    await employee.destroy({ transaction });
  }

  if (employer) {
    await employer.update({
      name: DELETED_USER_NAME,
      organization_type: '-',
      organization_name: DELETED_ORG_NAME,
      document_link: null,
      email: '-',
      aadhar_number: '-',
      deleted_at: deletedAt
    }, { paranoid: false, transaction });

    await employer.destroy({ transaction });
  }

  await user.update({
    name: DELETED_USER_NAME,
    mobile: tombstoneMobile(user.id),
    is_active: false,
    deleted_at: deletedAt
  }, { paranoid: false, transaction });

  await user.destroy({ transaction });

  return deletedAt;
}

async function deleteByUserId(userId, { deletedByAdminId } = {}) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid user id');
    err.status = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(id, { paranoid: false, transaction });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const employee = await Employee.findOne({ where: { user_id: id }, paranoid: false, transaction });
    const employer = await Employer.findOne({
      where: { user_id: id },
      include: [{ model: BusinessCategory, as: 'BusinessCategory', required: false }],
      paranoid: false,
      transaction
    });

    const deletedAt = await snapshotAndDeleteUser({
      user,
      employee,
      employer,
      deletedByAdminId,
      transaction
    });

    return { deletedAt };
  });
}

async function deleteByEmployeeId(employeeId, { deletedByAdminId } = {}) {
  const id = Number(employeeId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid employee id');
    err.status = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const employee = await Employee.findByPk(id, { paranoid: false, transaction });
    if (!employee) {
      const err = new Error('Employee not found');
      err.status = 404;
      throw err;
    }

    const user = await User.findByPk(employee.user_id, { paranoid: false, transaction });
    if (!user) {
      const err = new Error('User not found for employee');
      err.status = 404;
      throw err;
    }

    const deletedAt = await snapshotAndDeleteUser({
      user,
      employee,
      employer: null,
      deletedByAdminId,
      transaction
    });

    return { deletedAt };
  });
}

async function deleteByEmployerId(employerId, { deletedByAdminId } = {}) {
  const id = Number(employerId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid employer id');
    err.status = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const employer = await Employer.findByPk(id, {
      paranoid: false,
      include: [{ model: BusinessCategory, as: 'BusinessCategory', required: false }],
      transaction
    });

    if (!employer) {
      const err = new Error('Employer not found');
      err.status = 404;
      throw err;
    }

    const user = await User.findByPk(employer.user_id, { paranoid: false, transaction });
    if (!user) {
      const err = new Error('User not found for employer');
      err.status = 404;
      throw err;
    }

    const deletedAt = await snapshotAndDeleteUser({
      user,
      employee: null,
      employer,
      deletedByAdminId,
      transaction
    });

    return { deletedAt };
  });
}

module.exports = {
  deleteByUserId,
  deleteByEmployeeId,
  deleteByEmployerId
};
