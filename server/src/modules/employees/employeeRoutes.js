import { Router } from 'express';
import {
  getEmployees,
  getEmployeeById,
  getMyProfile,
  updateMyProfile,
  createEmployee,
  updateEmployee,
  confirmProbation,
  promoteEmployee,
  processResignation,
  issueRelievingLetter,
  deleteEmployee,
} from './employeeController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Self-service profile routes (must precede /:id)
router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);

router.get('/', getEmployees);
router.get('/:id', getEmployeeById);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createEmployee);
router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateEmployee);
router.patch('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateEmployee);

// Lifecycle actions
router.patch('/:id/confirm', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), confirmProbation);
router.patch('/:id/promote', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), promoteEmployee);
router.patch('/:id/resignation', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), processResignation);
router.patch('/:id/relieving-letter', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), issueRelievingLetter);

router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteEmployee);

export default router;
