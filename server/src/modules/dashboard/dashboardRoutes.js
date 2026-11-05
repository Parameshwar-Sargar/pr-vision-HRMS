import { Router } from 'express';
import { getDashboardStats } from './dashboardController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';

const router = Router();

router.use(authenticate, enforceTenant);
router.get('/stats', getDashboardStats);

export default router;

