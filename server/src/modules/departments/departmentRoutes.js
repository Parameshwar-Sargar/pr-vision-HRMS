import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from './departmentController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/', getDepartments);
router.post('/', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), createDepartment);
router.put('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), updateDepartment);
router.delete('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), deleteDepartment);

export default router;

