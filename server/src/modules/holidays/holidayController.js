import { z } from 'zod';
import Holiday from '../../models/Holiday.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const holidaySchema = z.object({
  name: z.string().min(2, 'Holiday name is required'),
  date: z.string().min(1, 'Date is required'),
  branchId: z.string().nullable().optional(),
  description: z.string().optional().default(''),
  isOptional: z.boolean().default(false),
});

export const getHolidays = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear(), branchId } = req.query;
    const filter = { year: parseInt(year, 10) };
    if (branchId) {
      filter.$or = [{ branchId: null }, { branchId }];
    }

    const holidays = await Holiday.find(filter)
      .populate('branchId', 'name code')
      .sort({ date: 1 });

    return sendSuccess(res, 'Holidays retrieved.', { holidays });
  } catch (error) {
    next(error);
  }
};

export const createHoliday = async (req, res, next) => {
  try {
    const validated = holidaySchema.parse(req.body);
    const holidayDate = new Date(validated.date);
    const year = holidayDate.getFullYear();

    const holiday = await Holiday.create({
      name: validated.name,
      date: holidayDate,
      year,
      branchId: validated.branchId || null,
      description: validated.description,
      isOptional: validated.isOptional,
    });

    return sendSuccess(res, 'Holiday created successfully.', { holiday }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validated = holidaySchema.parse(req.body);

    const holiday = await Holiday.findById(id);
    if (!holiday) {
      return sendError(res, 'Holiday not found.', [], 404);
    }

    holiday.name = validated.name;
    holiday.date = new Date(validated.date);
    holiday.year = holiday.date.getFullYear();
    holiday.branchId = validated.branchId || null;
    holiday.description = validated.description;
    holiday.isOptional = validated.isOptional;

    await holiday.save();
    return sendSuccess(res, 'Holiday updated successfully.', { holiday });
  } catch (error) {
    next(error);
  }
};

export const deleteHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) {
      return sendError(res, 'Holiday not found.', [], 404);
    }
    return sendSuccess(res, 'Holiday deleted successfully.');
  } catch (error) {
    next(error);
  }
};
