import { Router } from 'express';
import { getEmployeeReport, getAttendanceReport, getPayrollReport } from './reportController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN));

router.get('/employees', getEmployeeReport);
router.get('/attendance', getAttendanceReport);
router.get('/payroll', getPayrollReport);

export default router;
