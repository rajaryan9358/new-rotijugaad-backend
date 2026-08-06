const User = require('../../models/User');
const Employee = require('../../models/Employee');
const Employer = require('../../models/Employer');
const Log = require('../../models/Log');
const Review = require('../../models/Review');
const UserNotification = require('../../models/UserNotification');
const { sendApiResponse } = require('../_helpers/response');

const SUCCESS_CODE = 'SC_01';

async function safeCreateLog(payload) {
  try {
    await Log.create(payload);
  } catch (error) {
    console.error('[app/users:logs] failed to create log', error);
  }
}

async function countUserUnreadNotifications(userId) {
  return UserNotification.count({
    where: {
      user_id: userId,
      is_read: false,
    },
  });
}

async function fetchProfileMetaForUser(userId, userType) {
  const type = String(userType || '').trim().toLowerCase();

  if (type === 'employee') {
    const row = await Employee.findOne({
      where: { user_id: userId },
      attributes: ['id', 'verification_status'],
    });
    return {
      profileCompleted: Boolean(row),
      profileStatus: row?.verification_status ?? null,
    };
  }

  if (type === 'employer') {
    const row = await Employer.findOne({
      where: { user_id: userId },
      attributes: ['id', 'verification_status'],
    });
    return {
      profileCompleted: Boolean(row),
      profileStatus: row?.verification_status ?? null,
    };
  }

  return { profileCompleted: false, profileStatus: null };
}

function serializeUser(userInstance, { profileCompleted = false, profileStatus } = {}) {
  if (!userInstance) return null;
  const user = userInstance.toJSON ? userInstance.toJSON() : userInstance;

  // Never leak OTP
  delete user.otp;

  return {
    id: user.id,
    preferred_language: user.preferred_language,
    name: user.name,
    mobile: user.mobile,
    referred_by: user.referred_by,
    referral_code: user.referral_code,
    total_referred: user.total_referred,
    user_type: user.user_type,
    profile_status: profileStatus ?? user.profile_status,
    phone_verified_at: user.phone_verified_at,
    profile_completed_at: user.profile_completed_at,
    profile_completed: Boolean(user.profile_completed_at),
    is_active: user.is_active,
    delete_pending: user.delete_pending,
    last_active_at: user.last_active_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function serializeUserNotification(notificationInstance) {
  if (!notificationInstance) return null;
  const notification = notificationInstance.toJSON
    ? notificationInstance.toJSON()
    : notificationInstance;

  return {
    id: notification.id,
    user_id: notification.user_id,
    user_type: notification.user_type,
    title_english: notification.title_english,
    title_hindi: notification.title_hindi,
    body_english: notification.body_english,
    body_hindi: notification.body_hindi,
    title_en: notification.title_english,
    title_hi: notification.title_hindi,
    body_en: notification.body_english,
    body_hi: notification.body_hindi,
    reference_type: notification.reference_type,
    reference_id: notification.reference_id,
    is_read: Boolean(notification.is_read),
    read_at: notification.read_at,
    created_at: notification.created_at,
    updated_at: notification.updated_at,
    received_at: notification.created_at,
  };
}

async function getUserById(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const { profileCompleted, profileStatus } = await fetchProfileMetaForUser(id, user.user_type);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'User detail fetched successfully',
      data: {
        user: serializeUser(user, { profileCompleted, profileStatus }),
      },
    });
  } catch (error) {
    console.error('[app/users/:id]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to fetch user detail',
      data: null,
    });
  }
}

async function getUserNotifications(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const user = await User.findByPk(id, { attributes: ['id'] });
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const limitRaw = Number.parseInt(String(req.query?.limit ?? '100'), 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 200)
      : 100;

    const notifications = await UserNotification.findAll({
      where: { user_id: id },
      order: [['created_at', 'DESC']],
      limit,
    });

    const unreadCount = await countUserUnreadNotifications(id);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'User notifications fetched successfully',
      data: {
        unread_count: unreadCount,
        notifications: notifications
          .map(serializeUserNotification)
          .filter(Boolean),
      },
    });
  } catch (error) {
    console.error('[app/users/:id/notifications]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to fetch user notifications',
      data: null,
    });
  }
}

async function markUserNotificationsRead(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const user = await User.findByPk(id, { attributes: ['id'] });
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const rawIds = req.body?.notification_ids
      ?? req.body?.notificationIds
      ?? req.body?.ids
      ?? req.body?.id;

    const notificationIds = (Array.isArray(rawIds) ? rawIds : [rawIds])
      .map((value) => Number.parseInt(String(value ?? ''), 10))
      .filter((value) => Number.isInteger(value) && value > 0);

    const uniqueIds = Array.from(new Set(notificationIds));

    let updatedCount = 0;
    if (uniqueIds.length) {
      const [count] = await UserNotification.update(
        {
          is_read: true,
          read_at: new Date(),
        },
        {
          where: {
            user_id: id,
            id: uniqueIds,
            is_read: false,
          },
        },
      );
      updatedCount = Number(count) || 0;
    }

    const unreadCount = await countUserUnreadNotifications(id);

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'User notifications marked read successfully',
      data: {
        updated_count: updatedCount,
        unread_count: unreadCount,
      },
    });
  } catch (error) {
    console.error('[app/users/:id/notifications/read]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to mark user notifications read',
      data: null,
    });
  }
}


async function updatePreferredLanguage(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const preferredLanguageRaw = req.body?.preferred_language ?? req.body?.language;
    const preferredLanguage = String(preferredLanguageRaw ?? '').trim().toUpperCase();
    if (preferredLanguage !== 'EN' && preferredLanguage !== 'HI') {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_04',
        message: 'preferred_language must be EN or HI',
        data: null,
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const { profileCompleted, profileStatus } = await fetchProfileMetaForUser(id, user.user_type);

    await user.update({ preferred_language: preferredLanguage });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Preferred language updated successfully',
      data: {
        user: serializeUser(user, { profileCompleted, profileStatus }),
      },
    });
  } catch (error) {
    console.error('[app/users/:id/preferred-language]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to update preferred language',
      data: null,
    });
  }
}

async function updateLastActiveAt(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const { profileCompleted, profileStatus } = await fetchProfileMetaForUser(id, user.user_type);

    await user.update({ last_active_at: new Date() });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'User last active updated successfully',
      data: {
        user: serializeUser(user, { profileCompleted, profileStatus }),
      },
    });
  } catch (error) {
    console.error('[app/users/:id/last-active]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to update user last active',
      data: null,
    });
  }
}

async function submitDeletionRequest(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const nextRequestedAt = user.delete_requested_at || new Date();
    const shouldUpdate = !user.delete_pending || !user.delete_requested_at;

    if (shouldUpdate) {
      await user.update({
        delete_pending: true,
        delete_requested_at: nextRequestedAt,
      });

      await safeCreateLog({
        category: 'pending deletion',
        type: 'add',
        redirect_to: '/users/deletion-requests',
        log_text: `Deletion request submitted by user #${user.id} (${user.mobile || '-'})`,
        rj_employee_id: null,
      });
    }

    const { profileCompleted, profileStatus } = await fetchProfileMetaForUser(
      id,
      user.user_type,
    );

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Account deletion request submitted successfully',
      data: {
        user: serializeUser(user, { profileCompleted, profileStatus }),
        delete_requested_at: user.delete_requested_at,
      },
    });
  } catch (error) {
    console.error('[app/users/:id/delete-request]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to submit account deletion request',
      data: null,
    });
  }
}

async function createUserReview(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const ratingRaw = req.body?.rating ?? req.body?.stars;
    const rating = Number.parseInt(String(ratingRaw ?? ''), 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_04',
        message: 'rating must be an integer between 1 and 5',
        data: null,
      });
    }

    const reviewRaw = req.body?.review ?? req.body?.comment ?? '';
    // Keep review optional on the client; DB requires non-null, so allow empty string.
    const reviewText = String(reviewRaw ?? '').trim();

    const user = await User.findByPk(id, { attributes: ['id', 'user_type'] });
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    const derivedType = String(user.user_type || '').trim().toLowerCase();
    const bodyType = String(req.body?.user_type ?? req.body?.type ?? '').trim().toLowerCase();
    const userType = (derivedType === 'employee' || derivedType === 'employer')
      ? derivedType
      : (bodyType === 'employee' || bodyType === 'employer')
        ? bodyType
        : null;

    if (!userType) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_05',
        message: 'user_type must be employee or employer',
        data: null,
      });
    }

    const created = await Review.create({
      user_type: userType,
      user_id: id,
      rating,
      review: reviewText,
    });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'Review submitted successfully',
      data: {
        review: {
          id: created.id,
          user_id: created.user_id,
          user_type: created.user_type,
          rating: created.rating,
          review: created.review,
          created_at: created.created_at,
        },
      },
    });
  } catch (error) {
    console.error('[app/users/:id/reviews:create]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to submit review',
      data: null,
    });
  }
}

async function updateFcmToken(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_01',
        message: 'Valid user id is required',
        data: null,
      });
    }

    const tokenRaw = req.body?.fcm_token ?? req.body?.fcmToken ?? req.body?.token;
    const token = tokenRaw == null ? null : String(tokenRaw).trim();

    const user = await User.findByPk(id);
    if (!user) {
      return sendApiResponse(res, {
        ok: false,
        code: 'FC_02',
        message: 'User not found',
        data: null,
      });
    }

    await user.update({ fcm_token: token && token.length ? token : null });

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: 'FCM token updated successfully',
      data: {
        user_id: user.id,
        fcm_token: user.fcm_token,
      },
    });
  } catch (error) {
    console.error('[app/users/:id/fcm-token]', error);
    return sendApiResponse(res, {
      ok: false,
      code: 'FC_03',
      message: 'Failed to update FCM token',
      data: null,
    });
  }
}

module.exports = {
  getUserById,
  getUserNotifications,
  markUserNotificationsRead,
  updatePreferredLanguage,
  updateLastActiveAt,
  submitDeletionRequest,
  createUserReview,
  updateFcmToken,
};
