import { z } from 'zod';
import Attendance from '../../models/Attendance.js';
import Employee from '../../models/Employee.js';
import { ATTENDANCE_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';

const correctionRequestSchema = z.object({
  requestedCheckIn: z.string().optional(),
  requestedCheckOut: z.string().optional(),
  reason: z.string().trim().min(3, 'Please provide a brief reason for the attendance correction.'),
});

const getDayBoundary = (d = new Date()) => {
  const date = new Date(d);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  return { start, end };
};

export const checkIn = async (req, res, next) => {
  try {
    if (!req.verifiedEmployeeId) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 403);
    }
    const employee = await Employee.findOne({ _id: req.verifiedEmployeeId, isDeleted: false })
      .select('_id firstName lastName employeeId departmentId branchId shiftId')
      .populate('shiftId', 'startTime gracePeriodMinutes')
      .lean();

    if (!employee) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 403);
    }

    const now = new Date();
    const { start, end } = getDayBoundary(now);

    let record = await Attendance.findOne({
      employeeId: employee._id,
      date: { $gte: start, $lte: end },
    });

    if (record && record.checkInTime) {
      return sendError(res, 'You have already checked in for today.', [], 400);
    }

    let status = ATTENDANCE_STATUS.PRESENT;
    if (employee.shiftId && employee.shiftId.startTime) {
      const [shiftHour, shiftMinute] = employee.shiftId.startTime.split(':').map(Number);
      const shiftStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), shiftHour, shiftMinute, 0);
      const gracePeriodMs = (employee.shiftId.gracePeriodMinutes || 15) * 60 * 1000;

      if (now.getTime() > shiftStartTime.getTime() + gracePeriodMs) {
        status = ATTENDANCE_STATUS.LATE;
      }
    }

    if (!record) {
      record = await Attendance.create({
        employeeId: employee._id,
        date: start,
        checkInTime: now,
        status,
        shiftId: employee.shiftId?._id || null,
        branchId: employee.branchId || null,
        clockMethod: 'Web',
        ipAddress: req.ip,
      });
    } else {
      record.checkInTime = now;
      record.status = status;
      await record.save();
    }

    const populatedRecord = {
      ...record.toObject(),
      employeeId: {
        _id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeId: employee.employeeId,
        departmentId: employee.departmentId,
        branchId: employee.branchId,
      },
    };

    return sendSuccess(res, `Check-in recorded at ${now.toLocaleTimeString()}`, { record: populatedRecord });
  } catch (error) {
    next(error);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    if (!req.verifiedEmployeeId) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 403);
    }
    const employee = await Employee.findOne({ _id: req.verifiedEmployeeId, isDeleted: false })
      .select('_id firstName lastName employeeId departmentId branchId')
      .lean();

    if (!employee) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 403);
    }

    const now = new Date();
    const { start, end } = getDayBoundary(now);

    const record = await Attendance.findOne({
      employeeId: employee._id,
      date: { $gte: start, $lte: end },
    });

    if (!record || !record.checkInTime) {
      return sendError(res, 'You must check in before checking out.', [], 400);
    }

    if (record.checkOutTime) {
      return sendError(res, 'You have already checked out for today.', [], 400);
    }

    record.checkOutTime = now;

    const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    record.totalHours = totalHours;

    const standardHours = 8;
    if (totalHours > standardHours) {
      record.overtimeHours = Math.round((totalHours - standardHours) * 10) / 10;
    }

    if (totalHours < 4) {
      record.status = ATTENDANCE_STATUS.HALF_DAY;
    }

    await record.save();

    const populatedRecord = {
      ...record.toObject(),
      employeeId: {
        _id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeId: employee.employeeId,
        departmentId: employee.departmentId,
        branchId: employee.branchId,
      },
    };

    return sendSuccess(res, `Check-out recorded at ${now.toLocaleTimeString()}. Total worked: ${totalHours} hours.`, {
      record: populatedRecord,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendance = async (req, res, next) => {
  try {
    const { employeeId, branchId, startDate, endDate, status } = req.query;

    const query = {};

    // Strict Role-Based Isolation
    if (isAdminOrHR(req.user.role)) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.employeeId = employeeId;
      }
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const teamEmployees = await Employee.find({
        managerId: req.verifiedEmployeeId,
        isDeleted: false,
      })
        .select('_id')
        .lean();
      const teamIds = teamEmployees.map((e) => e._id);
      teamIds.push(req.verifiedEmployeeId);

      if (employeeId) {
        const isAllowed = teamIds.some((id) => id.toString() === employeeId.toString());
        if (!isAllowed) {
          return sendError(res, 'Access denied: You can only view attendance records for your direct reporting team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: teamIds };
      }
    } else {
      // EMPLOYEE, RECRUITER, PAYROLL_ADMIN: strictly own attendance records only
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile is linked to your user account.', [], 403);
      }
      if (employeeId && employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: Employees can only view their own attendance records.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    if (branchId) query.branchId = branchId;

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    if (status) query.status = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });

    const [total, attendance] = await Promise.all([
      Attendance.countDocuments(query),
      Attendance.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('employeeId', 'firstName lastName employeeId departmentId branchId')
        .lean(),
    ]);

    return sendSuccess(res, 'Attendance records retrieved.', {
      attendance,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

// Biometric Hardware Integration Architecture Sync Endpoint (Optimized batch lookup + bulkWrite)
export const syncBiometricLogs = async (req, res, next) => {
  try {
    const { logs } = req.body; // Array of { employeeCode, timestamp, deviceId, logType }
    if (!Array.isArray(logs) || logs.length === 0) {
      return sendError(res, 'No biometric records supplied for synchronization.', [], 400);
    }

    const uniqueCodes = [...new Set(logs.map((l) => l.employeeCode).filter(Boolean))];
    const employees =
      uniqueCodes.length > 0
        ? await Employee.find({
            employeeId: { $in: uniqueCodes },
            isDeleted: false,
          })
            .select('_id employeeId')
            .lean()
        : [];

    const empByCode = new Map(employees.map((e) => [e.employeeId, e]));
    if (empByCode.size === 0) {
      return sendSuccess(res, 'Biometric sync processed. 0 punch records evaluated.', { syncedCount: 0 });
    }

    const empIds = employees.map((e) => e._id);
    const uniqueDateTimes = [
      ...new Set(
        logs
          .filter((l) => empByCode.has(l.employeeCode))
          .map((l) => getDayBoundary(new Date(l.timestamp)).start.getTime())
      ),
    ];
    const uniqueDates = uniqueDateTimes.map((t) => new Date(t));

    const existingRecords = await Attendance.find({
      employeeId: { $in: empIds },
      date: { $in: uniqueDates },
    })
      .select('_id employeeId date checkInTime checkOutTime totalHours')
      .lean();

    const stateMap = new Map();
    for (const rec of existingRecords) {
      const key = `${rec.employeeId.toString()}_${new Date(rec.date).getTime()}`;
      stateMap.set(key, { ...rec, isNew: false, isDirty: false });
    }

    let syncedCount = 0;
    for (const log of logs) {
      const employee = empByCode.get(log.employeeCode);
      if (!employee) continue;

      const logTime = new Date(log.timestamp);
      const { start } = getDayBoundary(logTime);
      const key = `${employee._id.toString()}_${start.getTime()}`;
      const existing = stateMap.get(key);

      if (!existing) {
        stateMap.set(key, {
          employeeId: employee._id,
          date: start,
          checkInTime: logTime,
          checkOutTime: null,
          totalHours: 0,
          status: ATTENDANCE_STATUS.PRESENT,
          clockMethod: 'Biometric',
          biometricLogId: log.deviceId || 'DEV-BIO-01',
          isNew: true,
          isDirty: true,
        });
      } else if (!existing.checkOutTime && logTime > new Date(existing.checkInTime)) {
        existing.checkOutTime = logTime;
        const diffMs = logTime.getTime() - new Date(existing.checkInTime).getTime();
        existing.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        existing.isDirty = true;
      }
      syncedCount++;
    }

    const bulkOps = [];
    for (const item of stateMap.values()) {
      if (!item.isDirty) continue;
      if (item.isNew) {
        bulkOps.push({
          insertOne: {
            document: {
              employeeId: item.employeeId,
              date: item.date,
              checkInTime: item.checkInTime,
              checkOutTime: item.checkOutTime,
              totalHours: item.totalHours,
              status: item.status,
              clockMethod: item.clockMethod,
              biometricLogId: item.biometricLogId,
            },
          },
        });
      } else {
        bulkOps.push({
          updateOne: {
            filter: { _id: item._id },
            update: {
              $set: {
                checkOutTime: item.checkOutTime,
                totalHours: item.totalHours,
              },
            },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await Attendance.bulkWrite(bulkOps);
    }

    return sendSuccess(res, `Biometric sync processed. ${syncedCount} punch records evaluated.`, { syncedCount });
  } catch (error) {
    next(error);
  }
};

export const adjustAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid attendance record ID.', [], 400);
    }
    const { checkInTime, checkOutTime, status, notes } = req.body;

    const record = await Attendance.findById(id);
    if (!record) {
      return sendError(res, 'Attendance record not found.', [], 404);
    }

    if (checkInTime) record.checkInTime = new Date(checkInTime);
    if (checkOutTime) record.checkOutTime = new Date(checkOutTime);
    if (status) record.status = status;
    if (notes !== undefined) record.notes = String(notes);

    if (record.checkInTime && record.checkOutTime) {
      const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
      record.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    }

    record.clockMethod = 'Manual';
    await record.save();

    return sendSuccess(res, 'Attendance adjusted successfully.', { record });
  } catch (error) {
    next(error);
  }
};

export const submitCorrectionRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid attendance record ID.', [], 400);
    }

    const validated = correctionRequestSchema.parse(req.body);

    const record = await Attendance.findById(id);
    if (!record) {
      return sendError(res, 'Attendance record not found.', [], 404);
    }

    const isOwner =
      req.verifiedEmployeeId && record.employeeId.toString() === req.verifiedEmployeeId.toString();
    if (!isOwner && !isAdminOrHR(req.user.role)) {
      return sendError(
        res,
        "Access denied: You can only request corrections for your own attendance records.",
        [],
        403
      );
    }

    record.correctionRequest = {
      isRequested: true,
      requestedCheckIn: validated.requestedCheckIn ? new Date(validated.requestedCheckIn) : undefined,
      requestedCheckOut: validated.requestedCheckOut ? new Date(validated.requestedCheckOut) : undefined,
      reason: validated.reason,
      status: 'Pending',
    };
    await record.save();

    return sendSuccess(res, 'Attendance regularization/correction request submitted.', { record });
  } catch (error) {
    next(error);
  }
};
