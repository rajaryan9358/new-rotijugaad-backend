const crypto = require('crypto');

const { sequelize } = require('../config/db');
const Setting = require('../models/Setting');
const PaymentHistory = require('../models/PaymentHistory');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');
const EmployeeSubscriptionPlan = require('../models/EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan = require('../models/EmployerSubscriptionPlan');
const { findByPkWithOptionalAttribute } = require('./optionalDiscountedPrice');

const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';
const CASHFREE_ENVIRONMENT = String(
  process.env.CASHFREE_ENVIRONMENT || 'SANDBOX',
).trim().toUpperCase();

function toPlain(row) {
  return row?.toJSON ? row.toJSON() : row;
}

function normalizeMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Number(amount.toFixed(2));
}

function getPlanModel(userType) {
  return userType === 'employer'
    ? EmployerSubscriptionPlan
    : EmployeeSubscriptionPlan;
}

function getAccountModel(userType) {
  return userType === 'employer' ? Employer : Employee;
}

function getCashfreeBaseUrl() {
  if (process.env.CASHFREE_BASE_URL) {
    return String(process.env.CASHFREE_BASE_URL).replace(/\/+$/, '');
  }

  return CASHFREE_ENVIRONMENT === 'PRODUCTION'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

async function getCashfreeCredentials() {
  const setting = await Setting.findOne({
    order: [['id', 'ASC']],
    attributes: ['id', 'cashfree_id', 'cashfree_secret'],
  });
  const data = toPlain(setting) || {};

  const appId = String(
    process.env.CASHFREE_APP_ID || data.cashfree_id || '',
  ).trim();
  const secretKey = String(
    process.env.CASHFREE_SECRET_KEY || data.cashfree_secret || '',
  ).trim();

  if (!appId || !secretKey) {
    throw new Error('Cashfree credentials are not configured');
  }

  return { appId, secretKey };
}

async function cashfreeRequest(method, path, body) {
  const { appId, secretKey } = await getCashfreeCredentials();
  const url = `${getCashfreeBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': CASHFREE_API_VERSION,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (_) {}

  if (!response.ok) {
    throw new Error(
      json?.message || json?.error_description || json?.error || `Cashfree request failed with ${response.status}`,
    );
  }

  return json || {};
}

async function resolveAccountAndPlan({ userType, userId, planId }) {
  const AccountModel = getAccountModel(userType);
  const PlanModel = getPlanModel(userType);

  const account = await AccountModel.findByPk(userId, { paranoid: false });
  if (!account) {
    throw new Error(userType === 'employer' ? 'Employer not found' : 'Employee not found');
  }

  const accountData = toPlain(account);
  const user = await User.findByPk(accountData.user_id, { paranoid: false });
  if (!user) {
    throw new Error('User not found');
  }

  const plan = await findByPkWithOptionalAttribute(PlanModel, planId, { paranoid: false });
  if (!plan) {
    throw new Error('Subscription plan not found');
  }

  const planData = toPlain(plan);
  if (planData.is_active === false) {
    throw new Error('Subscription plan is inactive');
  }

  return {
    account,
    accountData,
    user: toPlain(user),
    plan,
    planData,
  };
}

function buildInvoiceNumber(userType, userId) {
  const prefix = userType === 'employer' ? 'EMPLOYER' : 'EMPLOYEE';
  return `INV-${prefix}-${userId}-${Date.now()}`;
}

function computeExpiryDate(currentExpiryAt, validityDays) {
  const days = Number(validityDays || 0);
  if (!Number.isFinite(days) || days <= 0) return null;

  const current = currentExpiryAt ? new Date(currentExpiryAt) : null;
  const hasCurrent = current && !Number.isNaN(current.getTime());
  const now = new Date();
  const base = hasCurrent && current.getTime() > now.getTime() ? current : now;
  const expiry = new Date(base.getTime());
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

function extractText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function extractOrderId(payload) {
  return extractText(
    payload?.data?.order?.order_id,
    payload?.data?.order?.orderId,
    payload?.data?.payment?.order_id,
    payload?.data?.payment?.orderId,
    payload?.data?.order_id,
    payload?.order?.order_id,
    payload?.order?.orderId,
    payload?.order_id,
    payload?.orderId,
  );
}

function extractPaymentId(payload) {
  return extractText(
    payload?.data?.payment?.cf_payment_id,
    payload?.data?.payment?.payment_id,
    payload?.data?.payment?.paymentId,
    payload?.cf_payment_id,
    payload?.payment_id,
    payload?.paymentId,
  );
}

function extractPaymentStatus(payload) {
  return extractText(
    payload?.data?.payment?.payment_status,
    payload?.data?.payment?.paymentStatus,
    payload?.payment_status,
    payload?.paymentStatus,
    payload?.order_status,
    payload?.orderStatus,
  ).toUpperCase();
}

function orderStatusToLocalStatus(orderStatus, fallbackPaymentStatus = '') {
  const status = extractText(orderStatus, fallbackPaymentStatus).toUpperCase();
  if (!status) return 'init';
  if (status === 'PAID' || status === 'SUCCESS') return 'success';
  if (
    status === 'FAILED' ||
    status === 'FAILURE' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED' ||
    status === 'TERMINATED' ||
    status === 'USER_DROPPED'
  ) {
    return 'failed';
  }
  if (
    status === 'PENDING' ||
    status === 'NOT_ATTEMPTED' ||
    status === 'ACTIVE' ||
    status === 'INITIALIZED'
  ) {
    return 'pending';
  }
  return 'pending';
}

function buildPaymentSummary(paymentHistory, remoteOrder) {
  const payment = toPlain(paymentHistory) || {};
  const remote = remoteOrder || {};
  const orderStatus = extractText(remote.order_status, remote.orderStatus).toUpperCase();

  return {
    payment_history_id: payment.id || null,
    order_id: payment.order_id || remote.order_id || null,
    order_amount: remote.order_amount ?? payment.price_total ?? null,
    order_currency: remote.order_currency || 'INR',
    order_status: orderStatus || null,
    payment_status: payment.status || 'init',
    payment_id: payment.payment_id || null,
    payment_session_id: remote.payment_session_id || null,
    user_type: payment.user_type || null,
    user_id: payment.user_id || null,
    plan_id: payment.plan_id || null,
    invoice_number: payment.invoice_number || null,
    expiry_at: payment.expiry_at || null,
    is_paid: payment.status === 'success',
  };
}

async function createSubscriptionOrder({ userType, userId, planId }) {
  const { user, planData } = await resolveAccountAndPlan({ userType, userId, planId });

  const customerPhone = String(user.mobile || '').trim();
  if (!customerPhone) {
    throw new Error('Customer phone is not available');
  }

  const amount = normalizeMoney(planData.discounted_price) || normalizeMoney(planData.plan_price);
  if (amount <= 0) {
    throw new Error('Subscription plan amount is invalid');
  }

  const orderId = `sub_${userType}_${userId}_${crypto.randomUUID()}`;
  const remoteOrder = await cashfreeRequest('POST', '/orders', {
    order_currency: 'INR',
    order_id: orderId,
    order_amount: amount,
    customer_details: {
      customer_id: String(user.id),
      customer_phone: customerPhone,
    },
    order_note: `${userType} subscription purchase`,
  });

  const expiryAt = computeExpiryDate(null, planData.plan_validity_days);

  const paymentHistory = await PaymentHistory.create({
    user_type: userType,
    user_id: userId,
    plan_id: planData.id,
    price_total: amount,
    order_id: remoteOrder.order_id || orderId,
    payment_id: null,
    payment_signature: null,
    status: 'init',
    contact_credit: Number(planData.contact_credits || 0),
    interest_credit: Number(planData.interest_credits || 0),
    ads_credit: Number(planData.ad_credits || 0),
    expiry_at: expiryAt,
    invoice_number: buildInvoiceNumber(userType, userId),
  });

  return {
    paymentHistory: toPlain(paymentHistory),
    order: remoteOrder,
    environment: CASHFREE_ENVIRONMENT,
    customer: {
      customer_id: String(user.id),
      customer_phone: customerPhone,
    },
  };
}

async function markPaymentFailed(paymentHistory, { paymentId, paymentSignature }) {
  if (!paymentHistory || paymentHistory.status === 'success') return paymentHistory;

  await paymentHistory.update({
    status: 'failed',
    payment_id: paymentId || paymentHistory.payment_id || null,
    payment_signature: paymentSignature || paymentHistory.payment_signature || null,
  });

  return paymentHistory;
}

async function markPaymentPending(paymentHistory, { paymentId, paymentSignature }) {
  if (!paymentHistory || paymentHistory.status === 'success') return paymentHistory;

  await paymentHistory.update({
    status: 'pending',
    payment_id: paymentId || paymentHistory.payment_id || null,
    payment_signature: paymentSignature || paymentHistory.payment_signature || null,
  });

  return paymentHistory;
}

async function applyPaidSubscription(paymentHistory, { remoteOrder, paymentId, paymentSignature }) {
  const tx = await sequelize.transaction();
  try {
    const payment = await PaymentHistory.findOne({
      where: { id: paymentHistory.id },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
      paranoid: false,
    });

    if (!payment) {
      throw new Error('Payment history not found');
    }

    if (payment.status === 'success') {
      await tx.commit();
      return payment;
    }

    const userType = payment.user_type;
    const AccountModel = getAccountModel(userType);
    const PlanModel = getPlanModel(userType);

    const account = await AccountModel.findOne({
      where: { id: payment.user_id },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
      paranoid: false,
    });

    if (!account) {
      throw new Error(userType === 'employer' ? 'Employer not found' : 'Employee not found');
    }

    const plan = await PlanModel.findOne({
      where: { id: payment.plan_id },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
      paranoid: false,
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const accountData = toPlain(account);
    const planData = toPlain(plan);
    const expiryAt = computeExpiryDate(
      accountData.credit_expiry_at,
      planData.plan_validity_days,
    );

    const updatePayload = {
      subscription_plan_id: planData.id,
      credit_expiry_at: expiryAt,
      total_contact_credit:
        Number(accountData.total_contact_credit || 0) +
        Number(planData.contact_credits || 0),
      contact_credit:
        Number(accountData.contact_credit || 0) +
        Number(planData.contact_credits || 0),
      total_interest_credit:
        Number(accountData.total_interest_credit || 0) +
        Number(planData.interest_credits || 0),
      interest_credit:
        Number(accountData.interest_credit || 0) +
        Number(planData.interest_credits || 0),
    };

    if (userType === 'employer') {
      updatePayload.total_ad_credit =
        Number(accountData.total_ad_credit || 0) +
        Number(planData.ad_credits || 0);
      updatePayload.ad_credit =
        Number(accountData.ad_credit || 0) + Number(planData.ad_credits || 0);
    }

    await account.update(updatePayload, { transaction: tx });

    await payment.update(
      {
        status: 'success',
        payment_id: paymentId || payment.payment_id || remoteOrder?.cf_order_id || null,
        payment_signature: paymentSignature || payment.payment_signature || null,
        expiry_at: expiryAt,
        contact_credit: Number(planData.contact_credits || 0),
        interest_credit: Number(planData.interest_credits || 0),
        ads_credit: Number(planData.ad_credits || 0),
      },
      { transaction: tx },
    );

    await tx.commit();
    return payment;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function fetchCashfreeOrder(orderId) {
  return cashfreeRequest('GET', `/orders/${encodeURIComponent(orderId)}`);
}

async function syncSubscriptionPaymentByOrderId(orderId, options = {}) {
  const paymentHistory = await PaymentHistory.findOne({
    where: { order_id: orderId },
    paranoid: false,
  });

  if (!paymentHistory) {
    return { found: false, data: null };
  }

  const previousStatus = paymentHistory.status;

  const webhookStatus = extractPaymentStatus(options.webhookPayload);
  if (webhookStatus) {
    const localOutcome = orderStatusToLocalStatus('', webhookStatus);

    if (localOutcome === 'success') {
      await applyPaidSubscription(paymentHistory, {
        remoteOrder: null,
        paymentId: extractPaymentId(options.webhookPayload),
        paymentSignature: options.paymentSignature,
      });
    } else if (localOutcome === 'failed') {
      await markPaymentFailed(paymentHistory, {
        paymentId: extractPaymentId(options.webhookPayload),
        paymentSignature: options.paymentSignature,
      });
    } else if (localOutcome === 'pending') {
      await markPaymentPending(paymentHistory, {
        paymentId: extractPaymentId(options.webhookPayload),
        paymentSignature: options.paymentSignature,
      });
    }

    const refreshed = await PaymentHistory.findByPk(paymentHistory.id, {
      paranoid: false,
    });
    const next = refreshed || paymentHistory;
    return {
      found: true,
      previous_status: previousStatus,
      next_status: next?.status || null,
      status_changed: previousStatus !== (next?.status || null),
      data: buildPaymentSummary(next, null),
    };
  }

  let remoteOrder = null;
  try {
    remoteOrder = await fetchCashfreeOrder(orderId);
  } catch (error) {
    if (paymentHistory.status === 'success' || paymentHistory.status === 'failed' || paymentHistory.status === 'pending' || paymentHistory.status === 'init') {
      return {
        found: true,
        previous_status: previousStatus,
        next_status: paymentHistory.status || null,
        status_changed: false,
        data: buildPaymentSummary(paymentHistory, null),
      };
    }

    const refreshed = await PaymentHistory.findByPk(paymentHistory.id, {
      paranoid: false,
    });
    const next = refreshed || paymentHistory;
    return {
      found: true,
      previous_status: previousStatus,
      next_status: next?.status || null,
      status_changed: previousStatus !== (next?.status || null),
      data: buildPaymentSummary(next, null),
    };
  }

  const localOutcome = orderStatusToLocalStatus(
    remoteOrder?.order_status,
    extractPaymentStatus(options.webhookPayload),
  );

  if (localOutcome === 'success') {
    await applyPaidSubscription(paymentHistory, {
      remoteOrder,
      paymentId:
        extractPaymentId(options.webhookPayload) ||
        extractText(
          remoteOrder?.cf_payment_id,
          remoteOrder?.payment_id,
          remoteOrder?.paymentId,
        ),
      paymentSignature: options.paymentSignature,
    });
  } else if (localOutcome === 'failed') {
    await markPaymentFailed(paymentHistory, {
      paymentId:
        extractPaymentId(options.webhookPayload) ||
        extractText(
          remoteOrder?.cf_payment_id,
          remoteOrder?.payment_id,
          remoteOrder?.paymentId,
        ),
      paymentSignature: options.paymentSignature,
    });
  }

  const refreshed = await PaymentHistory.findByPk(paymentHistory.id, {
    paranoid: false,
  });

  const next = refreshed || paymentHistory;
  return {
    found: true,
    previous_status: previousStatus,
    next_status: next?.status || null,
    status_changed: previousStatus !== (next?.status || null),
    data: buildPaymentSummary(next, remoteOrder),
  };
}

async function getSubscriptionPaymentStatus({ userType, userId, orderId }) {
  const paymentHistory = await PaymentHistory.findOne({
    where: { order_id: orderId, user_type: userType, user_id: userId },
    paranoid: false,
  });

  if (!paymentHistory) {
    return null;
  }

  return buildPaymentSummary(paymentHistory, null);
}

module.exports = {
  CASHFREE_ENVIRONMENT,
  createSubscriptionOrder,
  extractOrderId,
  getSubscriptionPaymentStatus,
  syncSubscriptionPaymentByOrderId,
};