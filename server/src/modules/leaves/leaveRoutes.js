import { Router } from 'express';
import {
  getLeaveTypes,
  createLeaveType,
  getLeaveBalances,
  applyLeave,
  getLeaveRequests,
  reviewLeaveRequest,
} from './leaveController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/types', getLeaveTypes);
router.post('/types', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), createLeaveType);
router.get('/balances', getLeaveBalances);
router.post('/apply', applyLeave);
router.get('/requests', getLeaveRequests);
router.patch(
  '/requests/:id/review',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER),
  reviewLeaveRequest
);

export default router;

