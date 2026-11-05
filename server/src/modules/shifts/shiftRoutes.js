import { Router } from 'express';
import { getShifts, createShift, updateShift, deleteShift } from './shiftController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getShifts);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createShift);
router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateShift);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteShift);

export default router;
