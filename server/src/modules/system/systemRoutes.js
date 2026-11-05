import { Router } from 'express';
import {
  getRolesAndPermissions,
  getAuditLogs,
  getSystemDiagnostics,
} from './systemController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER));

router.get('/roles-permissions', getRolesAndPermissions);
router.get('/audit-logs', getAuditLogs);
router.get('/diagnostics', getSystemDiagnostics);

export default router;

