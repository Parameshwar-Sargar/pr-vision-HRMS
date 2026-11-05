import { Router } from 'express';
import {
  getExpenseClaims,
  submitExpenseClaim,
  reviewExpenseClaim,
} from './expenseController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { upload } from '../../middleware/uploadMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getExpenseClaims);
router.post('/', upload.single('receipt'), submitExpenseClaim);
router.patch('/:id/review', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN, ROLES.MANAGER), reviewExpenseClaim);

export default router;

