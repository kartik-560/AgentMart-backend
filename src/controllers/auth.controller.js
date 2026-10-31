import { AuthService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export async function register(req, res, next) {
  try {
    const result = await AuthService.register(req.body);
    return sendSuccess(res, result, 'User registered successfully', 201);
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

