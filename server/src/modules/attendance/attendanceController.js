import Attendance from '../../models/Attendance.js';
import Employee from '../../models/Employee.js';
import Shift from '../../models/Shift.js';
import { ATTENDANCE_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const getDayBoundary = (d = new Date()) => {
  const date = new Date(d);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  return { start, end };
};

export const checkIn = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const employee = await Employee.findOne({ userId, isDeleted: false }).populate('shiftId');
    if (!employee) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 400);
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

    const populatedRecord = await Attendance.findById(record._id)
      .populate('employeeId', 'firstName lastName employeeId departmentId branchId')
      .lean();

    return sendSuccess(res, `Check-in recorded at ${now.toLocaleTimeString()}`, { record: populatedRecord });
  } catch (error) {
    next(error);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const employee = await Employee.findOne({ userId, isDeleted: false }).populate('shiftId');
    if (!employee) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 400);
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

    const populatedRecord = await Attendance.findById(record._id)
      .populate('employeeId', 'firstName lastName employeeId departmentId branchId')
      .lean();

    return sendSuccess(res, `Check-out recorded at ${now.toLocaleTimeString()}. Total worked: ${totalHours} hours.`, {
      record: populatedRecord,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendance = async (req, res, next) => {
  try {
    const { employeeId, branchId, startDate, endDate, status, page = 1, limit = 20 } = req.query;

    const query = {};

    // Strict Role-Based Isolation
    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile is linked to your user account.', [], 403);
      }
      if (employeeId && employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: Employees can only view their own attendance records.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const teamEmployees = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id');
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
    } else if (req.user.role === ROLES.HR_MANAGER || req.user.role === ROLES.ADMIN) {
      if (employeeId) {
        query.employeeId = employeeId;
      }
    } else {
      if (req.verifiedEmployeeId) {
        query.employeeId = req.verifiedEmployeeId;
      } else {
        return sendError(res, 'Access denied: Insufficient permissions to view attendance records.', [], 403);
      }
    }

    if (branchId) query.branchId = branchId;

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    if (status) query.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [total, attendance] = await Promise.all([
      Attendance.countDocuments(query),
      Attendance.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('employeeId', 'firstName lastName employeeId departmentId branchId')
        .lean(),
    ]);

    return sendSuccess(res, 'Attendance records retrieved.', {
      attendance,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Biometric Hardware Integration Architecture Sync Endpoint
export const syncBiometricLogs = async (req, res, next) => {
  try {
    const { logs } = req.body; // Array of { employeeCode, timestamp, deviceId, logType }
    if (!Array.isArray(logs) || logs.length === 0) {
      return sendError(res, 'No biometric records supplied for synchronization.', [], 400);
    }

    let syncedCount = 0;
    for (const log of logs) {
      const employee = await Employee.findOne({ employeeId: log.employeeCode, isDeleted: false });
      if (!employee) continue;

      const logTime = new Date(log.timestamp);
      const { start } = getDayBoundary(logTime);

      let record = await Attendance.findOne({ employeeId: employee._id, date: start });
      if (!record) {
        record = await Attendance.create({
          employeeId: employee._id,
          date: start,
          checkInTime: logTime,
          status: ATTENDANCE_STATUS.PRESENT,
          clockMethod: 'Biometric',
          biometricLogId: log.deviceId || 'DEV-BIO-01',
        });
      } else if (!record.checkOutTime && logTime > record.checkInTime) {
        record.checkOutTime = logTime;
        const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
        record.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        await record.save();
      }
      syncedCount++;
    }

    return sendSuccess(res, `Biometric sync processed. ${syncedCount} punch records evaluated.`, { syncedCount });
  } catch (error) {
    next(error);
  }
};

export const adjustAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { checkInTime, checkOutTime, status, notes } = req.body;

    const record = await Attendance.findById(id);
    if (!record) {
      return sendError(res, 'Attendance record not found.', [], 404);
    }

    if (checkInTime) record.checkInTime = new Date(checkInTime);
    if (checkOutTime) record.checkOutTime = new Date(checkOutTime);
    if (status) record.status = status;
    if (notes) record.notes = notes;

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
    const { requestedCheckIn, requestedCheckOut, reason } = req.body;

    const record = await Attendance.findById(id);
    if (!record) {
      return sendError(res, 'Attendance record not found.', [], 404);
    }

    record.correctionRequest = {
      isRequested: true,
      requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn) : undefined,
      requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : undefined,
      reason: reason || '',
      status: 'Pending',
      requestedAt: new Date(),
    };
    await record.save();

    return sendSuccess(res, 'Attendance regularization/correction request submitted.', { record });
  } catch (error) {
    next(error);
  }
};
