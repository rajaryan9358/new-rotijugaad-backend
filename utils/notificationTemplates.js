/**
 * Notification Templates
 *
 * All app push notification content lives here.
 * Placeholders use {{key}} syntax; available context vars depend on the trigger.
 *
 * Common vars:
 *   {{username}}  – display name of the recipient
 *   {{job}}       – job profile name (e.g. "Cook", "Driver")
 *   {{job_ref}}   – job reference string built by jobRefText() (#id or #id (profile))
 *   {{company}}   – employer company / org name
 *   {{candidate}} – candidate display name
 *   {{city}}      – city name
 *   {{credits}}   – total credits added (formatted string)
 */

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase();
}

function render(template, ctx) {
  const s = String(template || '');
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = ctx && Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : '';
    return v == null ? '' : String(v);
  });
}

const templates = {

  // ─── Employee: Profile status ────────────────────────────────────────────────

  /**
   * employee.verification.verified
   * Trigger: Admin marks employee verification_status = 'verified'
   * Function: notifyEmployeeStatusChange({ employeeId, field: 'verification_status', nextValue: 'verified' })
   */
  'employee.verification.verified': {
    title_en: '✅ Profile Verify Ho Gayi!',
    body_en:  'Khushkhabri! {{username}}! 🎉 Aapki profile verify ho gayi hai. Ab aap Roti Jugaad ke saare features ka use kar sakte hain aur jobs ke liye apply bhi kar sakte hain.',
    title_hi: '✅ Profile Verify Ho Gayi!',
    body_hi:  'Khushkhabri! {{username}}! 🎉 Aapki profile verify ho gayi hai. Ab aap Roti Jugaad ke saare features ka use kar sakte hain aur jobs ke liye apply bhi kar sakte hain.',
  },

  /**
   * employee.verification.rejected
   * Trigger: Admin marks employee verification_status = 'rejected'
   * Function: notifyEmployeeStatusChange({ employeeId, field: 'verification_status', nextValue: 'rejected' })
   */
  'employee.verification.rejected': {
    title_en: '❌ Profile Verify Nahi Ho Paayi',
    body_en:  '{{username}}, aapki profile verify nahi ho paayi. Kripya apni details check karke update karein aur dobara verification ke liye submit karein.',
    title_hi: '❌ Profile Verify Nahi Ho Paayi',
    body_hi:  '{{username}}, aapki profile verify nahi ho paayi. Kripya apni details check karke update karein aur dobara verification ke liye submit karein.',
  },

  /**
   * employee.kyc.verified
   * Trigger: Admin marks employee kyc_status = 'verified'
   * Function: notifyEmployeeStatusChange({ employeeId, field: 'kyc_status', nextValue: 'verified' })
   */
  'employee.kyc.verified': {
    title_en: '💙 KYC Verified',
    body_en:  'Khushkhabri {{username}}! Aapki KYC successfully verify ho gayi hai aur aapki profile par Blue Tick add kar diya gaya hai. Ab employers ka bharosa aur badhega.',
    title_hi: '💙 KYC Verified',
    body_hi:  'Khushkhabri {{username}}! Aapki KYC successfully verify ho gayi hai aur aapki profile par Blue Tick add kar diya gaya hai. Ab employers ka bharosa aur badhega.',
  },

  /**
   * employee.kyc.rejected
   * Trigger: Admin marks employee kyc_status = 'rejected'
   * Function: notifyEmployeeStatusChange({ employeeId, field: 'kyc_status', nextValue: 'rejected' })
   */
  'employee.kyc.rejected': {
    title_en: '❌ KYC Verify Nahi Ho Paayi',
    body_en:  'Aapki KYC verify nahi ho paayi. Kripya sahi documents upload karke dobara submit karein.',
    title_hi: '❌ KYC Verify Nahi Ho Paayi',
    body_hi:  'Aapki KYC verify nahi ho paayi. Kripya sahi documents upload karke dobara submit karein.',
  },

  // ─── Employee: Job notifications ─────────────────────────────────────────────

  /**
   * job.created.employee
   * Trigger: Admin creates a new job — sent to matching employees (by job profile)
   * Function: notifyUsers() inline in routes/jobs.js (POST /api/jobs)
   * Context: {{username}}, {{job}}
   */
  'job.created.employee': {
    title_en: '🔥 Nayi Job Aayi Hai!',
    body_en:  '{{username}}, aapke liye {{job}} ki nayi job post hui hai. Jaldi apply karein, vacancies limited ho sakti hain.',
    title_hi: '🔥 Nayi Job Aayi Hai!',
    body_hi:  '{{username}}, aapke liye {{job}} ki nayi job post hui hai. Jaldi apply karein, vacancies limited ho sakti hain.',
  },

  /**
   * job.approved.candidate
   * Trigger: Admin approves a job — sent to matching active employees (by job profile + city)
   * Function: notifyNewJobApprovedToCandidates({ jobId }) in systemNotifications.js
   * Context: {{username}}, {{job}}, {{city}}
   */
  'job.approved.candidate': {
    title_en: '🎯 Aapke Liye Perfect Job!',
    body_en:  '{{username}}, {{city}} mein {{job}} ki job aayi hai jo aapki profile se match karti hai. Abhi apply karein!',
    title_hi: '🎯 Aapke Liye Perfect Job!',
    body_hi:  '{{username}}, {{city}} mein {{job}} ki job aayi hai jo aapki profile se match karti hai. Abhi apply karein!',
  },

  /**
   * job_interest.employer_sent
   * Trigger: Employer sends interest in an employee's job profile
   * Function: notifyUser() inline in apis/candidates/candidates.controller.js (POST /candidates/jobs/send-interest)
   * Context: {{company}}, {{job}}
   */
  'job_interest.employer_sent': {
    title_en: '💙 Employer Interested Hai!',
    body_en:  'Khushkhabri! {{company}} ne aapki {{job}} profile mein interest dikhaya hai. Abhi check karein.',
    title_hi: '💙 Employer Interested Hai!',
    body_hi:  'Khushkhabri! {{company}} ne aapki {{job}} profile mein interest dikhaya hai. Abhi check karein.',
  },

  /**
   * application.hired
   * Trigger: Employer marks an applicant as hired
   * Function: notifyUser() inline in apis/employers/employers.controller.js
   * Recipient: The hired employee
   * Context: {{job}}
   */
  'application.hired': {
    title_en: '🎉 Aap Hire Ho Gaye!',
    body_en:  'Mubarak ho! Aapko {{job}} ke liye hire kar liya gaya hai.',
    title_hi: '🎉 Aap Hire Ho Gaye!',
    body_hi:  'Mubarak ho! Aapko {{job}} ke liye hire kar liya gaya hai.',
  },

  // ─── Employee: Credits & payment ─────────────────────────────────────────────

  /**
   * employee.credit.added
   * Trigger: Admin manually adds credits to an employee's account
   * Function: notifyUser() inline in routes/employees.js (PUT /api/employees/:id/credits)
   * Context: {{credits}} – dynamically built credit string
   */
  'employee.credit.added': {
    title_en: '💳 Credits Add Ho Gaye!',
    body_en:  'Mubarak ho! Aapke account mein {{credits}} add kar diye gaye hain. Inka use karke employers se connect karein.',
    title_hi: '💳 Credits Add Ho Gaye!',
    body_hi:  'Mubarak ho! Aapke account mein {{credits}} add kar diye gaye hain. Inka use karke employers se connect karein.',
  },

  /**
   * employee.subscription.payment.success
   * Trigger: Cashfree webhook — subscription payment success for employee
   * Function: notifySubscriptionPaymentStatus() in systemNotifications.js
   */
  'employee.subscription.payment.success': {
    title_en: 'Payment Successful',
    body_en:  'Aapki subscription purchase complete ho gayi hai. Credits aapke account mein add kar diye gaye hain.',
    title_hi: 'Payment Successful',
    body_hi:  'Aapki subscription purchase complete ho gayi hai. Credits aapke account mein add kar diye gaye hain.',
  },

  /**
   * employee.subscription.payment.failed
   * Trigger: Cashfree webhook — subscription payment failed for employee
   * Function: notifySubscriptionPaymentStatus() in systemNotifications.js
   */
  'employee.subscription.payment.failed': {
    title_en: '❌ Payment Successful Nahi Hua',
    body_en:  'Aapka payment complete nahi ho paya. Agar paise deduct hue hain to 3–4 working days mein refund ho jayega. Dobara try karein.',
    title_hi: '❌ Payment Successful Nahi Hua',
    body_hi:  'Aapka payment complete nahi ho paya. Agar paise deduct hue hain to 3–4 working days mein refund ho jayega. Dobara try karein.',
  },

  // ─── Employer: Profile status ────────────────────────────────────────────────

  /**
   * employer.verification.verified
   * Trigger: Admin marks employer verification_status = 'verified'
   * Function: notifyEmployerStatusChange({ employerId, field: 'verification_status', nextValue: 'verified' })
   */
  'employer.verification.verified': {
    title_en: '✅ Profile Verify Ho Gayi!',
    body_en:  'Mubarak ho! Aapki employer profile successfully verify ho gayi hai. Ab aap Roti Jugaad ke saare eligible features ka use kar sakte hain.',
    title_hi: '✅ Profile Verify Ho Gayi!',
    body_hi:  'Mubarak ho! Aapki employer profile successfully verify ho gayi hai. Ab aap Roti Jugaad ke saare eligible features ka use kar sakte hain.',
  },

  /**
   * employer.verification.rejected
   * Trigger: Admin marks employer verification_status = 'rejected'
   * Function: notifyEmployerStatusChange({ employerId, field: 'verification_status', nextValue: 'rejected' })
   */
  'employer.verification.rejected': {
    title_en: '⚠️ Profile Verify Nahi Ho Paayi',
    body_en:  'Aapki profile verification reject ho gayi hai. Kripya details update karke dobara verification ke liye submit karein.',
    title_hi: '⚠️ Profile Verify Nahi Ho Paayi',
    body_hi:  'Aapki profile verification reject ho gayi hai. Kripya details update karke dobara verification ke liye submit karein.',
  },

  /**
   * employer.kyc.verified
   * Trigger: Admin marks employer kyc_status = 'verified'
   * Function: notifyEmployerStatusChange({ employerId, field: 'kyc_status', nextValue: 'verified' })
   */
  'employer.kyc.verified': {
    title_en: '💙 KYC Verified',
    body_en:  'Congratulations {{username}}! Aapki KYC successfully verify ho gayi hai aur aapki profile par Blue Tick add kar diya gaya hai. Isse candidates ko aapki company par zyada bharosa hoga.',
    title_hi: '💙 KYC Verified',
    body_hi:  'Congratulations {{username}}! Aapki KYC successfully verify ho gayi hai aur aapki profile par Blue Tick add kar diya gaya hai. Isse candidates ko aapki company par zyada bharosa hoga.',
  },

  /**
   * employer.kyc.rejected
   * Trigger: Admin marks employer kyc_status = 'rejected'
   * Function: notifyEmployerStatusChange({ employerId, field: 'kyc_status', nextValue: 'rejected' })
   */
  'employer.kyc.rejected': {
    title_en: '❌ KYC Verify Nahi Ho Paayi',
    body_en:  'Aapki KYC verify nahi ho paayi. Kripya sahi documents upload karke dobara submit karein.',
    title_hi: '❌ KYC Verify Nahi Ho Paayi',
    body_hi:  'Aapki KYC verify nahi ho paayi. Kripya sahi documents upload karke dobara submit karein.',
  },

  // ─── Employer: Job status ────────────────────────────────────────────────────

  /**
   * job.status.activated
   * Trigger: Job status changes to 'active' (admin activates or employer re-activates)
   * Function: notifyJobStatusChange({ jobId, nextStatus: 'active' }) → notifyJobEvent()
   * Context: {{job_ref}}
   */
  'job.status.activated': {
    title_en: '🚀 Job Live Ho Gayi!',
    body_en:  'Aapki {{job_ref}} job successfully activate ho gayi hai. Ab candidates apply kar sakte hain.',
    title_hi: '🚀 Job Live Ho Gayi!',
    body_hi:  'Aapki {{job_ref}} job successfully activate ho gayi hai. Ab candidates apply kar sakte hain.',
  },

  /**
   * job.status.deactivated
   * Trigger: Job status changes to 'inactive' (admin or employer marks inactive)
   * Function: notifyJobStatusChange({ jobId, nextStatus: 'inactive' }) → notifyJobEvent()
   * Context: {{job_ref}}
   */
  'job.status.deactivated': {
    title_en: '📌 Job Inactive Ho Gayi',
    body_en:  'Aapki {{job_ref}} job ko inactive mark kar diya gaya hai. Zarurat ho to ise dobara activate karein.',
    title_hi: '📌 Job Inactive Ho Gayi',
    body_hi:  'Aapki {{job_ref}} job ko inactive mark kar diya gaya hai. Zarurat ho to ise dobara activate karein.',
  },

  /**
   * job.status.expired
   * Trigger: Job expiry date passes (cron) or admin sends manual expiry notification
   * Function: notifyJobStatusChange({ jobId, nextStatus: 'expired' }) / notifyJobExpiryBatch()
   * Context: {{job_ref}}
   */
  'job.status.expired': {
    title_en: '⏰ Job Expire Ho Gayi',
    body_en:  'Aapki {{job_ref}} job post expire ho gayi hai. Dobara candidates paane ke liye ise renew ya repost karein.',
    title_hi: '⏰ Job Expire Ho Gayi',
    body_hi:  'Aapki {{job_ref}} job post expire ho gayi hai. Dobara candidates paane ke liye ise renew ya repost karein.',
  },

  /**
   * job.expiry.today
   * Trigger: Cron job — job expires today (same-day warning)
   * Function: notifyJobExpiryBatch({ jobs, templateKey: 'job.expiry.today' }) in routes/cron.js
   * Context: {{job_ref}}
   */
  'job.expiry.today': {
    title_en: '⏰ Job Aaj Expire Ho Rahi Hai',
    body_en:  'Aapki {{job_ref}} job post aaj expire ho rahi hai. Applications milte rehne ke liye abhi renew karein.',
    title_hi: '⏰ Job Aaj Expire Ho Rahi Hai',
    body_hi:  'Aapki {{job_ref}} job post aaj expire ho rahi hai. Applications milte rehne ke liye abhi renew karein.',
  },

  /**
   * job.expiry.warning
   * Trigger: Cron job — job expires in 1 day
   * Function: notifyJobExpiryBatch({ jobs, templateKey: 'job.expiry.warning' }) in routes/cron.js
   * Context: {{job_ref}}
   */
  'job.expiry.warning': {
    title_en: '⏰ Job Kal Expire Ho Rahi Hai',
    body_en:  'Aapki {{job_ref}} job post kal expire ho rahi hai. Applications milte rehne ke liye ise renew karein.',
    title_hi: '⏰ Job Kal Expire Ho Rahi Hai',
    body_hi:  'Aapki {{job_ref}} job post kal expire ho rahi hai. Applications milte rehne ke liye ise renew karein.',
  },

  /**
   * job.verification.approved
   * Trigger: Admin approves a job (verification_status = 'approved')
   * Function: notifyJobVerificationChange({ jobId, nextVerificationStatus: 'approved' }) → notifyJobEvent()
   * Context: {{job_ref}}
   */
  'job.verification.approved': {
    title_en: '✅ Job Approve Ho Gayi',
    body_en:  'Good News! Aapki {{job_ref}} job approve ho gayi hai aur ab live hai.',
    title_hi: '✅ Job Approve Ho Gayi',
    body_hi:  'Good News! Aapki {{job_ref}} job approve ho gayi hai aur ab live hai.',
  },

  /**
   * job.verification.rejected
   * Trigger: Admin rejects a job (verification_status = 'rejected')
   * Function: notifyJobVerificationChange({ jobId, nextVerificationStatus: 'rejected' }) → notifyJobEvent()
   * Context: {{job_ref}}
   */
  'job.verification.rejected': {
    title_en: '❌ Job Approve Nahi Ho Paayi',
    body_en:  'Aapki {{job_ref}} job approve nahi ho paayi. Kripya details check karke dobara submit karein.',
    title_hi: '❌ Job Approve Nahi Ho Paayi',
    body_hi:  'Aapki {{job_ref}} job approve nahi ho paayi. Kripya details check karke dobara submit karein.',
  },

  // ─── Employer: Candidate interactions ────────────────────────────────────────

  /**
   * job_interest.employee_sent
   * Trigger: Employee sends interest in a job post
   * Function: notifyUser() inline in apis/jobs/jobs.detail.controller.js (POST /jobs/detail/:jobId/:employeeId/interest)
   * Context: {{candidate}}, {{job}}
   */
  'job_interest.employee_sent': {
    title_en: '📩 Naya Candidate Interested Hai!',
    body_en:  '{{candidate}} ne aapki {{job}} job mein interest dikhaya hai. Abhi profile check karein.',
    title_hi: '📩 Naya Candidate Interested Hai!',
    body_hi:  '{{candidate}} ne aapki {{job}} job mein interest dikhaya hai. Abhi profile check karein.',
  },

  /**
   * application.hired.employer
   * Trigger: Employer marks an applicant as hired
   * Function: notifyUser() inline in apis/employers/employers.controller.js
   * Recipient: The employer (confirmation)
   * Context: {{candidate}}, {{job}}
   */
  'application.hired.employer': {
    title_en: '🎉 Candidate Hire Ho Gaya!',
    body_en:  'Mubarak ho! Aapne {{candidate}} ko {{job}} ke liye hire kar liya hai.',
    title_hi: '🎉 Candidate Hire Ho Gaya!',
    body_hi:  'Mubarak ho! Aapne {{candidate}} ko {{job}} ke liye hire kar liya hai.',
  },

  // ─── Employer: Credits & payment ─────────────────────────────────────────────

  /**
   * employer.credit.added
   * Trigger: Admin manually adds credits to an employer's account
   * Function: notifyUser() inline in routes/employers.js (PUT /api/employers/:id/credits)
   * Context: {{credits}} – dynamically built credit string
   */
  'employer.credit.added': {
    title_en: '💳 Credits Add Ho Gaye!',
    body_en:  'Aapke account mein {{credits}} successfully add ho gaye hain. Inka use karke candidates se connect karein.',
    title_hi: '💳 Credits Add Ho Gaye!',
    body_hi:  'Aapke account mein {{credits}} successfully add ho gaye hain. Inka use karke candidates se connect karein.',
  },

  /**
   * employer.subscription.payment.success
   * Trigger: Cashfree webhook — subscription payment success for employer
   * Function: notifySubscriptionPaymentStatus() in systemNotifications.js
   */
  'employer.subscription.payment.success': {
    title_en: 'Payment Successful',
    body_en:  'Aapki subscription purchase complete ho gayi hai. Credits aapke account mein add kar diye gaye hain.',
    title_hi: 'Payment Successful',
    body_hi:  'Aapki subscription purchase complete ho gayi hai. Credits aapke account mein add kar diye gaye hain.',
  },

  /**
   * employer.subscription.payment.failed
   * Trigger: Cashfree webhook — subscription payment failed for employer
   * Function: notifySubscriptionPaymentStatus() in systemNotifications.js
   */
  'employer.subscription.payment.failed': {
    title_en: '❌ Payment Complete Nahi Hua',
    body_en:  'Aapka payment complete nahi ho paya. Agar paise deduct hue hain to 3–4 working days mein refund ho jayega. Dobara try karein.',
    title_hi: '❌ Payment Complete Nahi Hua',
    body_hi:  'Aapka payment complete nahi ho paya. Agar paise deduct hue hain to 3–4 working days mein refund ho jayega. Dobara try karein.',
  },
};

function getNotificationTemplate(key, ctx = {}) {
  const k = normalizeKey(key);
  const t = templates[k];
  if (!t) return null;

  return {
    key: k,
    title_en: render(t.title_en, ctx),
    body_en:  render(t.body_en,  ctx),
    title_hi: render(t.title_hi, ctx),
    body_hi:  render(t.body_hi,  ctx),
  };
}

module.exports = {
  getNotificationTemplate,
};
