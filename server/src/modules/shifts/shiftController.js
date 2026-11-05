import { z } from 'zod';
import Shift from '../../models/Shift.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const shiftSchema = z.object({
  name: z.string().min(2, 'Shift name is required'),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  breakDurationMinutes: z.number().default(60),
  gracePeriodMinutes: z.number().default(15),
  weeklyOffDays: z.array(z.number()).default([0, 6]),
  isDefault: z.boolean().default(false),
});

export const getShifts = async (req, res, next) => {
  try {
    const shifts = await Shift.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    return sendSuccess(res, 'Shifts retrieved.', { shifts });
  } catch (error) {
    next(error);
  }
};

export const createShift = async (req, res, next) => {
  try {
    const validated = shiftSchema.parse(req.body);

    if (validated.isDefault) {
      await Shift.updateMany({ tenantId: req.tenantId }, { isDefault: false });
    }

    const shift = await Shift.create({
      tenantId: req.tenantId,
      ...validated,
    });

    return sendSuccess(res, 'Shift created successfully.', { shift }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validated = shiftSchema.parse(req.body);

    const shift = await Shift.findOne({ _id: id, tenantId: req.tenantId });
    if (!shift) {
      return sendError(res, 'Shift not found.', [], 404);
    }

    if (validated.isDefault) {
      await Shift.updateMany({ tenantId: req.tenantId, _id: { $ne: id } }, { isDefault: false });
    }

    Object.assign(shift, validated);
    await shift.save();

    return sendSuccess(res, 'Shift updated successfully.', { shift });
  } catch (error) {
    next(error);
  }
};

export const deleteShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shift = await Shift.findOne({ _id: id, tenantId: req.tenantId });
    if (!shift) {
      return sendError(res, 'Shift not found.', [], 404);
    }

    await Shift.deleteOne({ _id: id });
    return sendSuccess(res, 'Shift deleted successfully.');
  } catch (error) {
    next(error);
  }
};

