import { Router } from 'express';
import {
  checkIn,
  checkOut,
  getAttendance,
  submitCorrectionRequest,
  adjustAttendance,
} from './attendanceController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/', getAttendance);
router.post('/:id/correction', submitCorrectionRequest);
router.patch(
  '/:id/adjust',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  adjustAttendance
);

export default router;

