import { Router } from 'express';
import { getCompanyProfile, updateCompanyProfile } from './tenantController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/profile', getCompanyProfile);
router.put('/profile', requireRoles(ROLES.COMPANY_ADMIN), updateCompanyProfile);

export default router;

