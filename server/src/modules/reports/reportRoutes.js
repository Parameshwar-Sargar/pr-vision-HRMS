import { Router } from 'express';
import { getEmployeeReport, getAttendanceReport, getPayrollReport } from './reportController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Employees & Attendance reports (Admin, HR, Payroll Admin, and Manager strictly scoped to direct team)
router.get(
  '/employees',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN, ROLES.MANAGER),
  getEmployeeReport
);
router.get(
  '/attendance',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN, ROLES.MANAGER),
  getAttendanceReport
);

// Payroll financial report strictly forbidden for Managers, Recruiters, and Employees
router.get('/payroll', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN), getPayrollReport);

export default router;
