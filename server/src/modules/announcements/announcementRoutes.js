import { Router } from 'express';
import {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from './announcementController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getAnnouncements);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createAnnouncement);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteAnnouncement);

export default router;
