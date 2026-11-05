import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead } from './notificationController.js';
import { authenticate } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);

export default router;

