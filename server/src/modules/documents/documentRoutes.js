import { Router } from 'express';
import { getDocuments, uploadDocument, downloadDocument } from './documentController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { upload } from '../../middleware/uploadMiddleware.js';

const router = Router();

router.use(authenticate, enforceTenant);

router.get('/', getDocuments);
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/:id/download', downloadDocument);

export default router;

