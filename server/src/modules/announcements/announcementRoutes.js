import { Router } from 'express';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from './announcementController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getAnnouncements);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createAnnouncement);
router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateAnnouncement);
router.patch('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateAnnouncement);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteAnnouncement);

export default router;

