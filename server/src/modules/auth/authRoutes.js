import { Router } from 'express';
import {
  login,
  refreshTokenHandler,
  logout,
  logoutAll,
  getActiveSessions,
  revokeSession,
  getCurrentUser,
} from './authController.js';
import { authenticate } from '../../middleware/authMiddleware.js';

const router = Router();

router.post('/login', login);
router.post('/refresh-token', refreshTokenHandler);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/sessions', authenticate, getActiveSessions);
router.delete('/sessions/:sessionId', authenticate, revokeSession);
router.get('/me', authenticate, getCurrentUser);

export default router;
