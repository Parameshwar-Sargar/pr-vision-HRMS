import { Router } from 'express';
import {
  getPerformanceReviews,
  createPerformanceReview,
  submitEmployeeSelfReview,
  submitManagerReview,
} from './performanceController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getPerformanceReviews);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER), createPerformanceReview);
router.patch('/:id/self-review', submitEmployeeSelfReview);
router.patch('/:id/manager-review', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER), submitManagerReview);

export default router;
