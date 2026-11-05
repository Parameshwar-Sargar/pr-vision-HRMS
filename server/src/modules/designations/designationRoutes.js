import { Router } from 'express';
import {
  getDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
} from './designationController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getDesignations);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createDesignation);
router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateDesignation);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteDesignation);

export default router;
