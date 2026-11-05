import { Router } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from './employeeController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/', getEmployees);
router.get('/:id', getEmployeeById);
router.post(
  '/',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  createEmployee
);
router.put(
  '/:id',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  updateEmployee
);
router.delete(
  '/:id',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  deleteEmployee
);

export default router;

