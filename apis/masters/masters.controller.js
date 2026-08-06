const { sendApiResponse } = require('../_helpers/response');

const State = require('../../models/State');
const City = require('../../models/City');
const Skill = require('../../models/Skill');
const Qualification = require('../../models/Qualification');
const Shift = require('../../models/Shift');
const JobProfile = require('../../models/JobProfile');
const DocumentType = require('../../models/DocumentType');
const AdditionalDocumentType = require('../../models/AdditionalDocumentType');
const WorkNature = require('../../models/WorkNature');
const BusinessCategory = require('../../models/BusinessCategory');
const Experience = require('../../models/Experience');
const ReferralCredit = require('../../models/ReferralCredit');
const Volunteer = require('../../models/Volunteer');
const SalaryType = require('../../models/SalaryType');
const SalaryRange = require('../../models/SalaryRange');
const Distance = require('../../models/Distance');
const EmployeeCallExperience = require('../../models/EmployeeCallExperience');
const EmployeeReportReason = require('../../models/EmployeeReportReason');
const EmployerCallExperience = require('../../models/EmployerCallExperience');
const EmployerReportReason = require('../../models/EmployerReportReason');
const VacancyNumber = require('../../models/VacancyNumber');
const JobBenefit = require('../../models/JobBenefit');

const SUCCESS_CODE = 'SC_01';

const job_genders = [
  { id: 'male', gender_english: 'Male', gender_hindi: 'पुरुष' },
  { id: 'female', gender_english: 'Female', gender_hindi: 'महिला' },
  { id: 'any', gender_english: 'Any', gender_hindi: 'कोई भी' },
];

function buildWhereActive(Model) {
  if (Model?.rawAttributes?.is_active) return { is_active: true };
  return {};
}

function buildOrder(Model) {
  if (Model?.rawAttributes?.sequence) return [['sequence', 'ASC'], ['id', 'ASC']];
  return [['id', 'ASC']];
}

async function getAllMasters(_req, res) {
  try {
    const [
      states,
      cities,
      skills,
      qualifications,
      shifts,
      job_profiles,
      document_types,
      additional_document_types,
      work_natures,
      business_categories,
      experiences,
      referral_credits,
      volunteers,
      salary_types,
      salary_ranges,
      distances,
      employee_call_experiences,
      employee_report_reasons,
      employer_call_experiences,
      employer_report_reasons,
      vacancy_numbers,
      job_benefits,
    ] = await Promise.all([
      State.findAll({ where: buildWhereActive(State), order: buildOrder(State) }),
      City.findAll({ where: buildWhereActive(City), order: buildOrder(City) }),
      Skill.findAll({ where: buildWhereActive(Skill), order: buildOrder(Skill) }),
      Qualification.findAll({ where: buildWhereActive(Qualification), order: buildOrder(Qualification) }),
      Shift.findAll({ where: buildWhereActive(Shift), order: buildOrder(Shift) }),
      JobProfile.findAll({ where: buildWhereActive(JobProfile), order: buildOrder(JobProfile) }),
      DocumentType.findAll({ where: buildWhereActive(DocumentType), order: buildOrder(DocumentType) }),
      AdditionalDocumentType.findAll({ where: buildWhereActive(AdditionalDocumentType), order: buildOrder(AdditionalDocumentType) }),
      WorkNature.findAll({ where: buildWhereActive(WorkNature), order: buildOrder(WorkNature) }),
      BusinessCategory.findAll({ where: buildWhereActive(BusinessCategory), order: buildOrder(BusinessCategory) }),
      Experience.findAll({ where: buildWhereActive(Experience), order: buildOrder(Experience) }),
      ReferralCredit.findAll({ order: buildOrder(ReferralCredit) }),
      Volunteer.findAll({ order: buildOrder(Volunteer) }),
      SalaryType.findAll({ where: buildWhereActive(SalaryType), order: buildOrder(SalaryType) }),
      SalaryRange.findAll({ where: buildWhereActive(SalaryRange), order: buildOrder(SalaryRange) }),
      Distance.findAll({ where: buildWhereActive(Distance), order: buildOrder(Distance) }),
      EmployeeCallExperience.findAll({ where: buildWhereActive(EmployeeCallExperience), order: buildOrder(EmployeeCallExperience) }),
      EmployeeReportReason.findAll({ where: buildWhereActive(EmployeeReportReason), order: buildOrder(EmployeeReportReason) }),
      EmployerCallExperience.findAll({ where: buildWhereActive(EmployerCallExperience), order: buildOrder(EmployerCallExperience) }),
      EmployerReportReason.findAll({ where: buildWhereActive(EmployerReportReason), order: buildOrder(EmployerReportReason) }),
      VacancyNumber.findAll({ where: buildWhereActive(VacancyNumber), order: buildOrder(VacancyNumber) }),
      JobBenefit.findAll({ where: buildWhereActive(JobBenefit), order: buildOrder(JobBenefit) }),
    ]);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Master data fetched successfully',
      data: {
        states,
        cities,
        skills,
        qualifications,
        shifts,
        job_profiles,
        document_types,
        additional_document_types,
        work_natures,
        business_categories,
        experiences,
        referral_credits,
        volunteers,
        salary_types,
        salary_ranges,
        distances,
        employee_call_experiences,
        employee_report_reasons,
        employer_call_experiences,
        employer_report_reasons,
        vacancy_numbers,
        job_benefits,
        job_genders,
      },
    });
  } catch (error) {
    console.error('[app/masters/all]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_01',
      message: 'Failed to fetch master data',
      data: null,
    });
  }
}


async function getCitiesByState(req, res) {
  try {
    const stateId = Number(req.params?.stateId);
    if (!stateId || Number.isNaN(stateId) || stateId <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: "FC_01",
        message: "Valid state id is required",
        data: null,
      });
    }

    const cities = await City.findAll({
      where: { ...buildWhereActive(City), state_id: stateId },
      order: buildOrder(City),
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Cities fetched successfully",
      data: { cities },
    });
  } catch (error) {
    console.error("[app/masters/states/:stateId/cities]", error);
    return sendApiResponse(res, {
      ok: false,
      code: "FC_02",
      message: "Failed to fetch cities",
      data: null,
    });
  }
}

module.exports = {
  getAllMasters,
  getCitiesByState,
};
