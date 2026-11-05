import { Router } from 'express';
import {
  checkIn,
  checkOut,
  getAttendance,
  submitCorrectionRequest,
  adjustAttendance,
  syncBiometricLogs,
} from './attendanceController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/', getAttendance);
router.post('/:id/correction', submitCorrectionRequest);
router.patch('/:id/adjust', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), adjustAttendance);
router.post('/biometric-sync', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), syncBiometricLogs);

export default router;
