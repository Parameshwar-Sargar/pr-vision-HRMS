import { Router } from 'express';
import {
  getGrievances,
  submitGrievance,
  updateGrievanceStatus,
} from './grievanceController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getGrievances);
router.post('/', submitGrievance);
router.patch('/:id/status', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateGrievanceStatus);

export default router;

