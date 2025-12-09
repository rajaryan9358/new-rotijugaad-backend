// Import all models first
const User = require('./User');
const State = require('./State');
const City = require('./City');
const Employee = require('./Employee');
const Employer = require('./Employer');
const Job = require('./Job');
const JobProfile = require('./JobProfile');
const JobGender = require('./JobGender');
const JobExperience = require('./JobExperience');
const Experience = require('./Experience');
const JobQualification = require('./JobQualification');
const Qualification = require('./Qualification');
const JobShift = require('./JobShift');
const Shift = require('./Shift');
const JobSkill = require('./JobSkill');
const Skill = require('./Skill');
const SelectedJobBenefit = require('./SelectedJobBenefit');
const JobBenefit = require('./JobBenefit');
const EmployeeSubscriptionPlan = require('./EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan = require('./EmployerSubscriptionPlan');
const EmployeeJobProfile = require('./EmployeeJobProfile');
const JobDay = require('./JobDay');
const JobInterest = require('./JobInterest'); // <-- Add this line

// Now define associations
Employee.belongsTo(User, { foreignKey: 'user_id', as: 'User' });
Employee.belongsTo(State, { foreignKey: 'state_id', as: 'State' });
Employee.belongsTo(City, { foreignKey: 'city_id', as: 'City' });
Employee.belongsTo(State, { foreignKey: 'preferred_state_id', as: 'PreferredState' });
Employee.belongsTo(City, { foreignKey: 'preferred_city_id', as: 'PreferredCity' });
Employee.belongsTo(Qualification, { foreignKey: 'qualification_id', as: 'Qualification' });
Employee.belongsTo(Shift, { foreignKey: 'preferred_shift_id', as: 'Shift' });
Employee.belongsTo(EmployeeSubscriptionPlan, { foreignKey: 'subscription_plan_id', as: 'SubscriptionPlan' });
Employee.hasMany(EmployeeJobProfile, { foreignKey: 'employee_id', as: 'EmployeeJobProfiles' });

User.hasMany(Employee, { foreignKey: 'user_id', as: 'Employees' });
State.hasMany(Employee, { foreignKey: 'state_id', as: 'Employees' });
City.hasMany(Employee, { foreignKey: 'city_id', as: 'Employees' });
Qualification.hasMany(Employee, { foreignKey: 'qualification_id', as: 'Employees' });
Shift.hasMany(Employee, { foreignKey: 'preferred_shift_id', as: 'Employees' });
EmployeeSubscriptionPlan.hasMany(Employee, { foreignKey: 'subscription_plan_id', as: 'Employees' });

EmployeeJobProfile.belongsTo(Employee, { foreignKey: 'employee_id', as: 'ProfileEmployee' });
EmployeeJobProfile.belongsTo(JobProfile, { foreignKey: 'job_profile_id', as: 'JobProfile' });
JobProfile.hasMany(EmployeeJobProfile, { foreignKey: 'job_profile_id', as: 'AssignedEmployees' });

// Employer associations (added)
Employer.belongsTo(User, { foreignKey: 'user_id', as: 'User' });
Employer.belongsTo(State, { foreignKey: 'state_id', as: 'State' });
Employer.belongsTo(City, { foreignKey: 'city_id', as: 'City' });
Employer.belongsTo(EmployerSubscriptionPlan, { foreignKey: 'subscription_plan_id', as: 'SubscriptionPlan' });

// Job associations
Job.belongsTo(Employer, { foreignKey: 'employer_id', as: 'Employer' });
Job.belongsTo(JobProfile, { foreignKey: 'job_profile_id', as: 'JobProfile' });
Job.hasMany(JobGender, { foreignKey: 'job_id', as: 'JobGenders' });
Job.hasMany(JobExperience, { foreignKey: 'job_id', as: 'JobExperiences' });
Job.hasMany(JobQualification, { foreignKey: 'job_id', as: 'JobQualifications' });
Job.hasMany(JobShift, { foreignKey: 'job_id', as: 'JobShifts' });
Job.hasMany(JobSkill, { foreignKey: 'job_id', as: 'JobSkills' });
Job.hasMany(SelectedJobBenefit, { foreignKey: 'job_id', as: 'SelectedJobBenefits' });

JobExperience.belongsTo(Experience, { foreignKey: 'experience_id', as: 'Experience' });
JobQualification.belongsTo(Qualification, { foreignKey: 'qualification_id', as: 'Qualification' });
JobShift.belongsTo(Shift, { foreignKey: 'shift_id', as: 'Shift' });
JobSkill.belongsTo(Skill, { foreignKey: 'skill_id', as: 'Skill' });
SelectedJobBenefit.belongsTo(JobBenefit, { foreignKey: 'benefit_id', as: 'JobBenefit' });

module.exports = {
  User,
  State,
  City,
  Employee,
  Employer,
  Job,
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
  SelectedJobBenefit,
  JobBenefit,
  EmployeeSubscriptionPlan,
  EmployerSubscriptionPlan,
  EmployeeJobProfile,
  JobDay,
  JobInterest // <-- Add this line
};
