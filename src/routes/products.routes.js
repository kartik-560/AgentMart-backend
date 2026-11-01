import { Router } from 'express';
import {
  getProducts,
  getProductById,
  getMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateInventory,
} from '../controllers/products.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { productQuerySchema } from '../modules/products/products.schema.js';

const router = Router();

// Specific routes first
router.get('/mine', authenticateToken, getMyProducts);

// Standard product catalog listing
router.get('/', validateRequest({ query: productQuerySchema }), getProducts);

// Create product (Authenticated supplier / seller)
router.post('/', authenticateToken, createProduct);

// Specific product operations
router.get('/:id', getProductById);
router.put('/:id', authenticateToken, updateProduct);
router.delete('/:id', authenticateToken, deleteProduct);
router.patch('/:id/inventory', updateInventory);

export default router;
