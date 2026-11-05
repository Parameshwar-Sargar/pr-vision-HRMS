import { Router } from 'express';
import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} from './holidayController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getHolidays);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createHoliday);
router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateHoliday);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteHoliday);

export default router;
