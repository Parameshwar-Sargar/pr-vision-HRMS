import { Router } from 'express';
import {
  getPerformanceReviews,
  createPerformanceReview,
  submitEmployeeSelfReview,
  submitManagerReview,
} from './performanceController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/', getPerformanceReviews);
router.post('/', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER), createPerformanceReview);
router.patch('/:id/self-review', submitEmployeeSelfReview);
router.patch(
  '/:id/manager-review',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER),
  submitManagerReview
);

export default router;

