import { Router } from 'express';
import {
  getTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgram,
  assignTraining,
  getTrainingAssignments,
  updateAssignmentProgress,
} from './trainingController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/programs', getTrainingPrograms);
router.post('/programs', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), createTrainingProgram);
router.put('/programs/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), updateTrainingProgram);
router.post('/programs/:id/assign', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER), assignTraining);

router.get('/assignments', getTrainingAssignments);
router.patch('/assignments/:id/progress', updateAssignmentProgress);

export default router;

