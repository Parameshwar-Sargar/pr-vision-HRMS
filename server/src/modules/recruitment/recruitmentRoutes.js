import { Router } from 'express';
import {
  getJobOpenings,
  createJobOpening,
  updateJobOpening,
  getCandidates,
  addCandidate,
  updateCandidateStatus,
} from './recruitmentController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/jobs', getJobOpenings);
router.post('/jobs', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), createJobOpening);
router.put('/jobs/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), updateJobOpening);

router.get('/candidates', getCandidates);
router.post('/candidates', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), addCandidate);
router.patch('/candidates/:id/status', requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER), updateCandidateStatus);

export default router;

