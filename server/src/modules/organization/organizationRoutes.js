import { Router } from 'express';
import {
  getCompanySettings,
  updateCompanySettings,
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
} from './organizationController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Settings
router.get('/settings', getCompanySettings);
router.put('/settings', requireRoles(ROLES.ADMIN), updateCompanySettings);

// Branches
router.get('/branches', getBranches);
router.post('/branches', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createBranch);
router.put('/branches/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateBranch);
router.delete('/branches/:id', requireRoles(ROLES.ADMIN), deleteBranch);

export default router;

