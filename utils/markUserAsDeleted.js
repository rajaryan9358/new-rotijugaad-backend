const markUserAsDeleted = async (user, transaction = undefined) => {
  if (!user) return null;
  const deletedAt = new Date();
  await user.update({
    otp: null,
    referred_by: null,
    preferred_language: null,
    phone_verified_at: null,
    is_active: false,
    verified_at: null,
    referral_code: null,
    total_referred: 0,
    profile_status: null,
    delete_pending: false,
    delete_requested_at: null,
    deleted_at: deletedAt
  }, { paranoid: false, transaction });
  return deletedAt;
};

module.exports = markUserAsDeleted;
