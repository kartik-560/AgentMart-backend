import { Router } from 'express';
import {
  register,
  login,
  getMe,
  requestOtp,
  verifyOtp,
} from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from '../modules/auth/auth.schema.js';

const router = Router();

// OTP Endpoints
router.post('/otp/send', validateRequest({ body: sendOtpSchema }), requestOtp);
router.post('/otp/verify', validateRequest({ body: verifyOtpSchema }), verifyOtp);

// Core Authentication
router.post('/register', validateRequest({ body: registerSchema }), register);
router.post('/login', validateRequest({ body: loginSchema }), login);
router.get('/me', authenticateToken, getMe);

export default router;
