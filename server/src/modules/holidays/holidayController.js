import { z } from 'zod';
import Holiday from '../../models/Holiday.js';
import { isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

const holidaySchema = z.object({
  name: z.string().trim().min(2, 'Holiday name is required'),
  date: z.string().min(1, 'Date is required'),
  branchId: z.string().nullable().optional(),
  description: z.string().trim().optional().default(''),
  isOptional: z.boolean().default(false),
});

export const getHolidays = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear(), branchId } = req.query;
    const parsedYear = parseInt(year, 10);
    const filter = { year: Number.isNaN(parsedYear) ? new Date().getFullYear() : parsedYear };
    if (branchId) {
      if (!isValidObjectId(branchId)) {
        return sendError(res, 'Invalid branch ID.', [], 400);
      }
      filter.$or = [{ branchId: null }, { branchId }];
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

    const [holidays, total] = await Promise.all([
      Holiday.find(filter)
        .populate('branchId', 'name code')
        .sort({ date: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Holiday.countDocuments(filter),
    ]);

    return sendSuccess(res, 'Holidays retrieved.', {
      holidays,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createHoliday = async (req, res, next) => {
  try {
    const validated = holidaySchema.parse(req.body);
    const holidayDate = new Date(validated.date);
    if (Number.isNaN(holidayDate.getTime())) {
      return sendError(res, 'Invalid holiday date.', [], 400);
    }
    const branchId = validated.branchId || null;
    if (branchId && !isValidObjectId(branchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }
    const year = holidayDate.getFullYear();

    const holiday = await Holiday.create({
      name: validated.name,
      date: holidayDate,
      year,
      branchId,
      description: validated.description,
      isOptional: validated.isOptional,
    });

    return sendSuccess(res, 'Holiday created successfully.', { holiday }, 201);
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 'A holiday for this date and branch already exists.', [], 409);
    }
    next(error);
  }
};

export const updateHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid holiday ID.', [], 400);
    }
    const validated = holidaySchema.parse(req.body);
    const holidayDate = new Date(validated.date);
    if (Number.isNaN(holidayDate.getTime())) {
      return sendError(res, 'Invalid holiday date.', [], 400);
    }
    const branchId = validated.branchId || null;
    if (branchId && !isValidObjectId(branchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    const holiday = await Holiday.findById(id);
    if (!holiday) {
      return sendError(res, 'Holiday not found.', [], 404);
    }

    holiday.name = validated.name;
    holiday.date = holidayDate;
    holiday.year = holidayDate.getFullYear();
    holiday.branchId = branchId;
    holiday.description = validated.description;
    holiday.isOptional = validated.isOptional;

    await holiday.save();
    return sendSuccess(res, 'Holiday updated successfully.', { holiday });
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 'Another holiday for this date and branch already exists.', [], 409);
    }
    next(error);
  }
};

export const deleteHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid holiday ID.', [], 400);
    }
    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) {
      return sendError(res, 'Holiday not found.', [], 404);
    }
    return sendSuccess(res, 'Holiday deleted successfully.');
  } catch (error) {
    next(error);
  }
};
