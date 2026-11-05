import { Router } from 'express';
import {
  registerCompany,
  login,
  refreshTokenHandler,
  logout,
  getCurrentUser,
} from './authController.js';
import { authenticate } from '../../middleware/authMiddleware.js';

const router = Router();

router.post('/register-company', registerCompany);
router.post('/login', login);
router.post('/refresh-token', refreshTokenHandler);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

export default router;

