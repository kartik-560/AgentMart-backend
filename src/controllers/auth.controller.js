import { AuthService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export async function requestOtp(req, res, next) {
  try {
    const result = await AuthService.requestOtp(req.body);
    return sendSuccess(res, result, result.message || 'Verification code sent to email');
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const result = AuthService.verifyOtp(req.body);
    return sendSuccess(res, result, 'Email verification successful');
  } catch (error) {
    next(error);
  }
}

export async function register(req, res, next) {
  try {
    const result = await AuthService.register(req.body);
    return sendSuccess(res, result, 'Organization and account registered successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await AuthService.login(req.body);
    return sendSuccess(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    return sendSuccess(res, req.user, 'Current user profile');
  } catch (error) {
    next(error);
  }
}
