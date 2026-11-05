import { z } from 'zod';
import Tenant from '../../models/Tenant.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const updateCompanySchema = z.object({
  name: z.string().min(2).optional(),
  logo: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
  businessInfo: z
    .object({
      taxId: z.string().optional(),
      registrationNumber: z.string().optional(),
      industry: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
  settings: z
    .object({
      timezone: z.string().optional(),
      currency: z.string().optional(),
      dateFormat: z.string().optional(),
      workingDays: z.array(z.string()).optional(),
      standardWorkHoursPerDay: z.number().optional(),
    })
    .optional(),
});

export const getCompanyProfile = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).populate('planId');
    if (!tenant) {
      return sendError(res, 'Company profile not found.', [], 404);
    }
    return sendSuccess(res, 'Company profile retrieved.', { tenant });
  } catch (error) {
    next(error);
  }
};

export const updateCompanyProfile = async (req, res, next) => {
  try {
    const validated = updateCompanySchema.parse(req.body);
    const tenant = await Tenant.findById(req.tenantId);

    if (!tenant) {
      return sendError(res, 'Company not found.', [], 404);
    }

    if (validated.name) tenant.name = validated.name;
    if (validated.logo !== undefined) tenant.logo = validated.logo;
    if (validated.contactEmail) tenant.contactEmail = validated.contactEmail;
    if (validated.contactPhone !== undefined) tenant.contactPhone = validated.contactPhone;

    if (validated.address) {
      tenant.address = { ...tenant.address, ...validated.address };
    }
    if (validated.businessInfo) {
      tenant.businessInfo = { ...tenant.businessInfo, ...validated.businessInfo };
    }
    if (validated.settings) {
      tenant.settings = { ...tenant.settings, ...validated.settings };
    }

    await tenant.save();

    await logAudit({
      req,
      action: 'COMPANY_SETTINGS_UPDATED',
      entity: 'Tenant',
      entityId: tenant._id,
      details: validated,
    });

    return sendSuccess(res, 'Company settings updated successfully.', { tenant });
  } catch (error) {
    next(error);
  }
};

