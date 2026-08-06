'use strict';

module.exports = {
  async up(q, S) {
    // Allow multiple OTP records over time, but keep only 1 active/unverified
    // record per (employer_id, interviewer_contact).

    // 1) Add is_active column (defaults to 1)
    try {
      await q.addColumn('interviewer_contact_otps', 'is_active', {
        type: S.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      });
    } catch (_e) {
      // Column may already exist
    }

    // 2) Backfill: verified rows inactive
    try {
      await q.sequelize.query(
        'UPDATE interviewer_contact_otps SET is_active = NULL WHERE verified_at IS NOT NULL'
      );
    } catch (_e) {}

    // 3) Ensure exactly one active unverified row per employer + contact
    // Keep the latest (max id) unverified row active; mark other unverified rows inactive.
    try {
      await q.sequelize.query(
        'UPDATE interviewer_contact_otps t ' +
          'JOIN ( ' +
          '  SELECT employer_id, interviewer_contact, MAX(id) AS max_id ' +
          '  FROM interviewer_contact_otps ' +
          '  WHERE verified_at IS NULL ' +
          '  GROUP BY employer_id, interviewer_contact ' +
          ') x ' +
          'ON t.employer_id = x.employer_id AND t.interviewer_contact = x.interviewer_contact ' +
          'SET t.is_active = CASE WHEN t.id = x.max_id THEN 1 ELSE NULL END ' +
          'WHERE t.verified_at IS NULL'
      );
    } catch (_e) {}

    // 4) Drop old unique index (employer_id, interviewer_contact)
    try {
      await q.removeIndex(
        'interviewer_contact_otps',
        'uniq_interviewer_contact_otp_employer_mobile'
      );
    } catch (_e) {}

    // 5) Add unique index to enforce only one active row per employer + contact
    try {
      await q.addIndex(
        'interviewer_contact_otps',
        ['employer_id', 'interviewer_contact', 'is_active'],
        {
          unique: true,
          name: 'uniq_interviewer_contact_otp_active',
        }
      );
    } catch (_e) {}
  },

  async down(q, _S) {
    try {
      await q.removeIndex(
        'interviewer_contact_otps',
        'uniq_interviewer_contact_otp_active'
      );
    } catch (_e) {}

    // Best-effort restore of old unique index
    try {
      await q.addIndex('interviewer_contact_otps', ['employer_id', 'interviewer_contact'], {
        unique: true,
        name: 'uniq_interviewer_contact_otp_employer_mobile',
      });
    } catch (_e) {}

    try {
      await q.removeColumn('interviewer_contact_otps', 'is_active');
    } catch (_e) {}
  },
};
