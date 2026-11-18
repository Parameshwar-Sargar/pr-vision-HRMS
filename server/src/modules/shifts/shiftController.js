import { z } from 'zod';
import Shift from '../../models/Shift.js';
import { ROLES } from '../../config/constants.js';
import { escapeRegex, isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

const shiftSchema = z.object({
  name: z.string().trim().min(2, 'Shift name is required'),
  code: z.string().trim().optional().default(''),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  breakDurationMinutes: z.coerce.number().min(0).default(60),
  gracePeriodMinutes: z.coerce.number().min(0).default(15),
  weeklyOffDays: z.array(z.coerce.number().int().min(0).max(6)).default([0, 6]),
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

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

    const [shifts, total] = await Promise.all([
      Shift.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Shift.countDocuments(query),
    ]);

    return sendSuccess(res, 'Shifts retrieved.', {
      shifts,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createShift = async (req, res, next) => {
  try {
    const validated = shiftSchema.parse(req.body);
    if (validated.startTime === validated.endTime) {
      return sendError(res, 'Shift end time must differ from start time.', [], 400);
    }

    const exists = await Shift.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(validated.name)}$`, 'i') },
    })
      .select('_id isActive')
      .lean();
    if (exists) {
      return sendError(res, 'A shift with this name already exists.', [], 409);
    }

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
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid shift ID.', [], 400);
    }
    const validated = shiftSchema.parse(req.body);
    if (validated.startTime === validated.endTime) {
      return sendError(res, 'Shift end time must differ from start time.', [], 400);
    }

    const shift = await Shift.findById(id);
    if (!shift) {
      return sendError(res, 'Shift not found.', [], 404);
    }

    const duplicate = await Shift.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${escapeRegex(validated.name)}$`, 'i') },
    })
      .select('_id')
      .lean();
    if (duplicate) {
      return sendError(res, 'Another shift with this name already exists.', [], 409);
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
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid shift ID.', [], 400);
    }
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
