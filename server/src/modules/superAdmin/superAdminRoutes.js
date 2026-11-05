import { Router } from 'express';
import {
  getPlatformStats,
  listCompanies,
  updateCompanyStatus,
  getPlans,
  getPlatformAuditLogs,
} from './superAdminController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

// Protect all Super Admin routes
router.use(authenticate, requireRoles(ROLES.SUPER_ADMIN));

router.get('/stats', getPlatformStats);
router.get('/companies', listCompanies);
router.patch('/companies/:id/status', updateCompanyStatus);
router.get('/plans', getPlans);
router.get('/audit-logs', getPlatformAuditLogs);

export default router;

