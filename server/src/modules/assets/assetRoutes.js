import { Router } from 'express';
import {
  getAssets,
  createAsset,
  updateAsset,
  assignAsset,
  returnAsset,
} from './assetController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getAssets);
router.post('/', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createAsset);
router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateAsset);
router.post('/:id/assign', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), assignAsset);
router.post('/:id/return', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), returnAsset);

export default router;
