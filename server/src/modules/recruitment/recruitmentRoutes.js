import { Router } from 'express';
import {
  getJobOpenings,
  createJobOpening,
  updateJobOpening,
  getCandidates,
  addCandidate,
  updateCandidateStatus,
  convertCandidateToEmployee,
} from './recruitmentController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/jobs', getJobOpenings);
router.post('/jobs', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.RECRUITER), createJobOpening);
router.put('/jobs/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.RECRUITER), updateJobOpening);

router.get(
  '/candidates',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.RECRUITER, ROLES.MANAGER),
  getCandidates
);
router.post('/candidates', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.RECRUITER), addCandidate);
router.patch('/candidates/:id/status', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.RECRUITER), updateCandidateStatus);
router.post('/candidates/:id/convert', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), convertCandidateToEmployee);

export default router;
