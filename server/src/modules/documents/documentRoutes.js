import { Router } from 'express';
import { getDocuments, uploadDocument, downloadDocument, deleteDocument } from './documentController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { upload } from '../../middleware/uploadMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

router.get('/', getDocuments);
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/:id/download', downloadDocument);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER), deleteDocument);

export default router;
