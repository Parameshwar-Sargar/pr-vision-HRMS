import { z } from 'zod';
import Shift from '../../models/Shift.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const shiftSchema = z.object({
  name: z.string().min(2, 'Shift name is required'),
  code: z.string().optional().default(''),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  breakDurationMinutes: z.number().default(60),
  gracePeriodMinutes: z.number().default(15),
  weeklyOffDays: z.array(z.number()).default([0, 6]),
  isNightShift: z.boolean().default(false),
  isRotational: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export const getShifts = async (req, res, next) => {
  try {
    let query = { isActive: true };

    // Strict Data Isolation: Employees only view their assigned shift
    if (req.user.role === ROLES.EMPLOYEE) {
      if (req.employee?.shiftId) {
        query = { _id: req.employee.shiftId, isActive: true };
      } else {
        query = { isDefault: true, isActive: true };
      }
    }

    const shifts = await Shift.find(query).sort({ createdAt: -1 });
    return sendSuccess(res, 'Shifts retrieved.', { shifts });
  } catch (error) {
    next(error);
  }
};

export const createShift = async (req, res, next) => {
  try {
    const validated = shiftSchema.parse(req.body);

    if (validated.isDefault) {
      await Shift.updateMany({}, { isDefault: false });
    }

    const shift = await Shift.create(validated);

    return sendSuccess(res, 'Shift created successfully.', { shift }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validated = shiftSchema.parse(req.body);

    const shift = await Shift.findById(id);
    if (!shift) {
      return sendError(res, 'Shift not found.', [], 404);
    }

    if (validated.isDefault) {
      await Shift.updateMany({ _id: { $ne: id } }, { isDefault: false });
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
    const shift = await Shift.findById(id);
    if (!shift) {
      return sendError(res, 'Shift not found.', [], 404);
    }

    shift.isActive = false;
    await shift.save();

    return sendSuccess(res, 'Shift archived successfully.');
  } catch (error) {
    next(error);
  }
};
