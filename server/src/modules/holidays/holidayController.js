import { z } from 'zod';
import Holiday from '../../models/Holiday.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const holidaySchema = z.object({
  name: z.string().min(2, 'Holiday name is required'),
  date: z.string().min(1, 'Date is required'),
  description: z.string().optional().default(''),
  isOptional: z.boolean().default(false),
});

export const getHolidays = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const holidays = await Holiday.find({
      tenantId: req.tenantId,
      year: parseInt(year, 10),
    }).sort({ date: 1 });

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
      tenantId: req.tenantId,
      name: validated.name,
      date: holidayDate,
      year,
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

    const holiday = await Holiday.findOne({ _id: id, tenantId: req.tenantId });
    if (!holiday) {
      return sendError(res, 'Holiday not found.', [], 404);
    }

    holiday.name = validated.name;
    holiday.date = new Date(validated.date);
    holiday.year = holiday.date.getFullYear();
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
    const holiday = await Holiday.findOne({ _id: id, tenantId: req.tenantId });
    if (!holiday) {
      return sendError(res, 'Holiday not found.', [], 404);
    }

    await Holiday.deleteOne({ _id: id });
    return sendSuccess(res, 'Holiday deleted successfully.');
  } catch (error) {
    next(error);
  }
};

