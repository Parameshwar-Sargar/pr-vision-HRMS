import { Router } from 'express';
import { getCurrentSubscription, upgradePlanDemo } from './subscriptionController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/', getCurrentSubscription);
router.post('/upgrade-demo', requireRoles(ROLES.COMPANY_ADMIN), upgradePlanDemo);

export default router;

