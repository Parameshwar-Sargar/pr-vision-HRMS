import Attendance from '../../models/Attendance.js';
import Employee from '../../models/Employee.js';
import Shift from '../../models/Shift.js';
import { ATTENDANCE_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

/**
 * Helper to get normalized midnight Date for a given date
 */
const getDayBoundary = (d = new Date()) => {
  const date = new Date(d);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  return { start, end };
};

/**
 * Clock In
 */
export const checkIn = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user._id;

    // Resolve employee profile
    const employee = await Employee.findOne({ tenantId, userId, isDeleted: false }).populate('shiftId');
    if (!employee) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 400);
    }

    const now = new Date();
    const { start, end } = getDayBoundary(now);

    // Prevent duplicate check-in
    let record = await Attendance.findOne({
      tenantId,
      employeeId: employee._id,
      date: { $gte: start, $lte: end },
    });

    if (record && record.checkInTime) {
      return sendError(res, 'You have already checked in for today.', [], 400);
    }

    // Determine status (Late vs Present based on shift)
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
        tenantId,
        employeeId: employee._id,
        date: start,
        checkInTime: now,
        status,
        ipAddress: req.ip,
      });
    } else {
      record.checkInTime = now;
      record.status = status;
      await record.save();
    }

    return sendSuccess(res, `Check-in recorded at ${now.toLocaleTimeString()}`, { record });
  } catch (error) {
    next(error);
  }
};

/**
 * Clock Out
 */
export const checkOut = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user._id;

    const employee = await Employee.findOne({ tenantId, userId, isDeleted: false }).populate('shiftId');
    if (!employee) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 400);
    }

    const now = new Date();
    const { start, end } = getDayBoundary(now);

    const record = await Attendance.findOne({
      tenantId,
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

    // Calculate total hours
    const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    record.totalHours = totalHours;

    // Overtime tracking (standard day = 8h)
    const standardHours = 8;
    if (totalHours > standardHours) {
      record.overtimeHours = Math.round((totalHours - standardHours) * 10) / 10;
    }

    // Half-day check (if less than 4 hours worked)
    if (totalHours < 4) {
      record.status = ATTENDANCE_STATUS.HALF_DAY;
    }

    await record.save();

    return sendSuccess(res, `Check-out recorded at ${now.toLocaleTimeString()}. Total worked: ${totalHours} hours.`, {
      record,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Attendance Records (Filtered by employee, date range, or company-wide for HR/Admin)
 */
export const getAttendance = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { employeeId, startDate, endDate, status, page = 1, limit = 20 } = req.query;

    const query = { tenantId };

    // Role-based visibility
    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ tenantId, userId: req.user._id });
      if (!myEmp) return sendSuccess(res, 'No employee record found.', { attendance: [] });
      query.employeeId = myEmp._id;
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Attendance.countDocuments(query);
    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('employeeId', 'firstName lastName employeeId departmentId');

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

/**
 * Submit Attendance Correction Request
 */
export const submitCorrectionRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { requestedCheckIn, requestedCheckOut, reason } = req.body;

    const record = await Attendance.findOne({ _id: id, tenantId: req.tenantId });
    if (!record) {
      return sendError(res, 'Attendance record not found.', [], 404);
    }

    record.correctionRequest = {
      isRequested: true,
      requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn) : record.checkInTime,
      requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : record.checkOutTime,
      reason,
      status: 'Pending',
    };

    await record.save();
    return sendSuccess(res, 'Correction request submitted for approval.', { record });
  } catch (error) {
    next(error);
  }
};

/**
 * HR / Admin Manual Attendance Adjustment
 */
export const adjustAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { checkInTime, checkOutTime, status, notes } = req.body;

    const record = await Attendance.findOne({ _id: id, tenantId: req.tenantId });
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

    if (record.correctionRequest?.isRequested) {
      record.correctionRequest.status = 'Approved';
      record.correctionRequest.reviewedBy = req.user._id;
    }

    await record.save();
    return sendSuccess(res, 'Attendance adjusted successfully.', { record });
  } catch (error) {
    next(error);
  }
};

