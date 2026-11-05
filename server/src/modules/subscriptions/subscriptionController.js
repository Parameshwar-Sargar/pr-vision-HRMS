import Plan from '../../models/Plan.js';
import Subscription from '../../models/Subscription.js';
import Tenant from '../../models/Tenant.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

export const getCurrentSubscription = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).populate('planId');
    const plans = await Plan.find({ isActive: true }).sort({ priceMonthly: 1 });
    const subscription = await Subscription.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 });

    return sendSuccess(res, 'Subscription details retrieved.', {
      currentPlan: {
        name: tenant.planName,
        employeeLimit: tenant.employeeLimit,
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
      },
      subscription,
      availablePlans: plans,
    });
  } catch (error) {
    next(error);
  }
};

export const upgradePlanDemo = async (req, res, next) => {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) {
      return sendError(res, 'Plan not found.', [], 404);
    }

    const tenant = await Tenant.findById(req.tenantId);
    tenant.planId = plan._id;
    tenant.planName = plan.name;
    tenant.employeeLimit = plan.maxEmployees;
    tenant.status = 'active';
    await tenant.save();

    const amount = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const sub = await Subscription.create({
      tenantId: req.tenantId,
      planId: plan._id,
      status: 'active',
      billingCycle,
      amount,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      invoices: [
        {
          invoiceId: `INV-${Date.now().toString().slice(-6)}`,
          amount,
          paidAt: now,
          status: 'Paid (Demo)',
        },
      ],
    });

    await logAudit({
      req,
      action: 'SUBSCRIPTION_UPGRADED_DEMO',
      entity: 'Tenant',
      entityId: tenant._id,
      details: { planName: plan.name, amount, billingCycle },
    });

    return sendSuccess(res, `Upgraded to ${plan.name} plan successfully (Demo Mode).`, {
      tenant,
      subscription: sub,
    });
  } catch (error) {
    next(error);
  }
};

