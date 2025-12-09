const express = require('express');
const router = express.Router();

// increase JSON/urlencoded size limits for this router
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ limit: '10mb', extended: true }));

const EmployeeSubscriptionPlan = require('../models/EmployeeSubscriptionPlan');
const EmployerSubscriptionPlan = require('../models/EmployerSubscriptionPlan');
const PlanBenefit = require('../models/PlanBenefit');
const { handleSelfieUpload } = require('../utils/selfieUpload');
const { Op } = require('sequelize');

/**
 * POST /upload/selfie
 * Upload a selfie image for storage and verification.
 */
router.post('/upload/selfie', (req, res) => handleSelfieUpload(req, res));

/**
 * GET /employee-plans
 * Retrieve all employee subscription plans.
 */
router.get('/employee-plans', async (req, res) => {
  try {
    const plans = await EmployeeSubscriptionPlan.findAll({
      order: [['sequence', 'ASC'], ['id', 'ASC']],
      paranoid: true,
    });
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Employee Plans fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employee-plans/sequence
 * Bulk update sequence ordering for employee plans.
 */
const applySequenceUpdates = async (Model, entries) => {
	const rows = (Array.isArray(entries) ? entries : [])
		.map((item) => ({
			id: Number(item?.id),
			sequence: item?.sequence === '' ? null : (Number(item?.sequence) || null)
		}))
		.filter((item) => Number.isInteger(item.id));
	if (!rows.length) return 0;

	const transaction = await Model.sequelize.transaction();
	try {
		await Promise.all(
			rows.map((row) =>
				Model.update(
					{ sequence: row.sequence },
					{ where: { id: row.id }, transaction }
				)
			)
		);
		await transaction.commit();
		return rows.length;
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

router.put('/employee-plans/sequence', async (req, res) => {
	try {
		const updated = await applySequenceUpdates(EmployeeSubscriptionPlan, req.body.plans);
		res.json({ success: true, message: 'Sequence updated successfully', updated });
	} catch (error) {
		console.error('Employee plan sequence update error:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

/**
 * GET /employee-plans/:id
 * Retrieve a specific employee subscription plan.
 */
router.get('/employee-plans/:id', async (req, res) => {
  try {
    const plan = await EmployeeSubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('Employee Plan fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employee-plans
 * Create a new employee subscription plan.
 */
router.post('/employee-plans', async (req, res) => {
  try {
    const {
      plan_name_english,
      plan_name_hindi,
      plan_validity_days,
      plan_tagline_english,
      plan_tagline_hindi,
      plan_price,
      contact_credits,
      interest_credits,
      sequence,
      is_active,
    } = req.body || {};

    if (
      !plan_name_english ||
      plan_validity_days === undefined ||
      plan_price === undefined ||
      contact_credits === undefined ||
      interest_credits === undefined
    ) {
      return res.status(400).json({ success: false, message: 'Required fields: plan_name_english, plan_validity_days, plan_price, contact_credits, interest_credits' });
    }

    const plan = await EmployeeSubscriptionPlan.create({
      plan_name_english,
      plan_name_hindi: plan_name_hindi || null,
      plan_validity_days: Number(plan_validity_days) || 0,
      plan_tagline_english: plan_tagline_english || null,
      plan_tagline_hindi: plan_tagline_hindi || null,
      plan_price: plan_price,
      contact_credits: Number(contact_credits) || 0,
      interest_credits: interest_credits,
      sequence: sequence === undefined || sequence === null || sequence === '' ? null : Number(sequence),
      is_active: is_active !== undefined ? !!is_active : true,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    console.error('Employee Plan create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employee-plans/:id
 * Update an existing employee subscription plan.
 */
router.put('/employee-plans/:id', async (req, res) => {
  try {
    const plan = await EmployeeSubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const payload = { ...req.body };

    // Normalize optional numeric fields
    if (payload.sequence === '') payload.sequence = null;
    if (payload.plan_validity_days !== undefined) payload.plan_validity_days = Number(payload.plan_validity_days) || 0;
    if (payload.contact_credits !== undefined) payload.contact_credits = Number(payload.contact_credits) || 0;
    if (payload.interest_credits !== undefined) payload.interest_credits = Number(payload.interest_credits) || 0;
    if (payload.is_active !== undefined) payload.is_active = !!payload.is_active;

    await plan.update(payload);
    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('Employee Plan update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employee-plans/:id
 * Soft delete an employee subscription plan.
 */
router.delete('/employee-plans/:id', async (req, res) => {
  try {
    const plan = await EmployeeSubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    await plan.destroy();
    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Employee Plan delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /employer-plans
 * Retrieve all employer subscription plans.
 */
router.get('/employer-plans', async (req, res) => {
  try {
    const plans = await EmployerSubscriptionPlan.findAll({
      order: [['sequence', 'ASC'], ['id', 'ASC']],
      paranoid: true,
    });
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Employer Plans fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employer-plans/sequence
 * Bulk update sequence ordering for employer plans.
 */
router.put('/employer-plans/sequence', async (req, res) => {
	try {
		const updated = await applySequenceUpdates(EmployerSubscriptionPlan, req.body.plans);
		res.json({ success: true, message: 'Sequence updated successfully', updated });
	} catch (error) {
		console.error('Employer plan sequence update error:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

/**
 * GET /employer-plans/:id
 * Retrieve a specific employer subscription plan.
 */
router.get('/employer-plans/:id', async (req, res) => {
  try {
    const plan = await EmployerSubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('Employer Plan fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /employer-plans
 * Create a new employer subscription plan.
 */
router.post('/employer-plans', async (req, res) => {
  try {
    const {
      plan_name_english,
      plan_name_hindi,
      plan_validity_days,
      plan_tagline_english,
      plan_tagline_hindi,
      plan_price,
      contact_credits,
      interest_credits,
      ad_credits,
      sequence,
      is_active,
    } = req.body || {};

    if (
      !plan_name_english ||
      plan_validity_days === undefined ||
      plan_price === undefined ||
      contact_credits === undefined ||
      interest_credits === undefined ||
      ad_credits === undefined
    ) {
      return res.status(400).json({ success: false, message: 'Required fields: plan_name_english, plan_validity_days, plan_price, contact_credits, interest_credits, ad_credits' });
    }

    const plan = await EmployerSubscriptionPlan.create({
      plan_name_english,
      plan_name_hindi: plan_name_hindi || null,
      plan_validity_days: Number(plan_validity_days) || 0,
      plan_tagline_english: plan_tagline_english || null,
      plan_tagline_hindi: plan_tagline_hindi || null,
      plan_price: plan_price,
      contact_credits: Number(contact_credits) || 0,
      interest_credits: interest_credits,
      ad_credits: Number(ad_credits) || 0,
      sequence: sequence === undefined || sequence === null || sequence === '' ? null : Number(sequence),
      is_active: is_active !== undefined ? !!is_active : true,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    console.error('Employer Plan create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /employer-plans/:id
 * Update an existing employer subscription plan.
 */
router.put('/employer-plans/:id', async (req, res) => {
  try {
    const plan = await EmployerSubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const payload = { ...req.body };

    // Normalize optional numeric fields
    if (payload.sequence === '') payload.sequence = null;
    if (payload.plan_validity_days !== undefined) payload.plan_validity_days = Number(payload.plan_validity_days) || 0;
    if (payload.contact_credits !== undefined) payload.contact_credits = Number(payload.contact_credits) || 0;
    if (payload.interest_credits !== undefined) payload.interest_credits = Number(payload.interest_credits) || 0;
    if (payload.ad_credits !== undefined) payload.ad_credits = Number(payload.ad_credits) || 0;
    if (payload.is_active !== undefined) payload.is_active = !!payload.is_active;

    await plan.update(payload);
    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('Employer Plan update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /employer-plans/:id
 * Soft delete an employer subscription plan.
 */
router.delete('/employer-plans/:id', async (req, res) => {
  try {
    const plan = await EmployerSubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    await plan.destroy();
    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Employer Plan delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /plan-benefits
 * Retrieve plan benefits with optional filters.
 */
router.get('/plan-benefits', async (req, res) => {
  try {
    const {
      subscription_type,
      plan_id,
      search,
      is_active,
      sortField,
      sortDir,
    } = req.query;
    const where = {};

    if (subscription_type) where.subscription_type = subscription_type;
    if (plan_id) {
      const parsedPlanId = Number(plan_id);
      if (!Number.isNaN(parsedPlanId)) where.plan_id = parsedPlanId;
    }

    if (is_active) {
      const normalized = is_active.toString().toLowerCase();
      if (normalized === 'active' || normalized === 'inactive') {
        where.is_active = normalized === 'active';
      } else if (normalized === 'true' || normalized === 'false') {
        where.is_active = normalized === 'true';
      }
    }

    const trimmedSearch = (search || '').trim();
    if (trimmedSearch) {
      const pattern = `%${trimmedSearch}%`;
      where[Op.or] = [
        { benefit_english: { [Op.like]: pattern } },
        { benefit_hindi: { [Op.like]: pattern } },
      ];
    }

    const allowedSortFields = new Set([
      'sequence',
      'subscription_type',
      'plan_id',
      'benefit_english',
      'benefit_hindi',
      'is_active',
    ]);
    const orderField = allowedSortFields.has(sortField) ? sortField : 'sequence';
    const direction = (sortDir || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const benefits = await PlanBenefit.findAll({
      where,
      order: [
        [orderField, direction],
        ['id', 'ASC'],
      ],
      paranoid: true,
    });

    res.json({ success: true, data: benefits });
  } catch (error) {
    console.error('Plan Benefits fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /plan-benefits/sequence
 * Bulk update sequence ordering for plan benefits.
 */
router.put('/plan-benefits/sequence', async (req, res) => {
	try {
		const updated = await applySequenceUpdates(PlanBenefit, req.body.benefits);
		res.json({ success: true, message: 'Sequence updated successfully', updated });
	} catch (error) {
		console.error('Plan benefit sequence update error:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

/**
 * GET /plan-benefits/:id
 * Retrieve a specific plan benefit.
 */
router.get('/plan-benefits/:id', async (req, res) => {
  try {
    const benefit = await PlanBenefit.findByPk(req.params.id);
    if (!benefit) return res.status(404).json({ success: false, message: 'Benefit not found' });
    res.json({ success: true, data: benefit });
  } catch (error) {
    console.error('Plan Benefit fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /plan-benefits
 * Create a new plan benefit.
 */
router.post('/plan-benefits', async (req, res) => {
  try {
    const {
      subscription_type,
      plan_id,
      benefit_english,
      benefit_hindi,
      sequence,
      is_active,
    } = req.body || {};

    if (!subscription_type || !plan_id || !benefit_english) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields: subscription_type, plan_id, benefit_english' 
      });
    }

    const benefit = await PlanBenefit.create({
      subscription_type,
      plan_id: Number(plan_id),
      benefit_english,
      benefit_hindi: benefit_hindi || null,
      sequence: sequence === undefined || sequence === null || sequence === '' ? null : Number(sequence),
      is_active: is_active !== undefined ? !!is_active : true,
    });

    res.status(201).json({ success: true, data: benefit });
  } catch (error) {
    console.error('Plan Benefit create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /plan-benefits/:id
 * Update an existing plan benefit.
 */
router.put('/plan-benefits/:id', async (req, res) => {
  try {
    const benefit = await PlanBenefit.findByPk(req.params.id);
    if (!benefit) return res.status(404).json({ success: false, message: 'Benefit not found' });

    const payload = { ...req.body };
    if (payload.sequence === '') payload.sequence = null;
    if (payload.plan_id !== undefined) payload.plan_id = Number(payload.plan_id);
    if (payload.is_active !== undefined) payload.is_active = !!payload.is_active;

    await benefit.update(payload);
    res.json({ success: true, data: benefit });
  } catch (error) {
    console.error('Plan Benefit update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /plan-benefits/:id
 * Soft delete a plan benefit.
 */
router.delete('/plan-benefits/:id', async (req, res) => {
  try {
    const benefit = await PlanBenefit.findByPk(req.params.id);
    if (!benefit) return res.status(404).json({ success: false, message: 'Benefit not found' });
    await benefit.destroy();
    res.json({ success: true, message: 'Benefit deleted successfully' });
  } catch (error) {
    console.error('Plan Benefit delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
