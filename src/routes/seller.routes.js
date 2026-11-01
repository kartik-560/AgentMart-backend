import { Router } from 'express';
import {
  getSellerDashboard,
  getSellerInventory,
  updateSellerStock,
  getSellerSettings,
  updateBusinessSettings,
  updateAgentSettings,
} from '../controllers/seller.controller.js';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
} from '../controllers/products.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Secure all seller routes with JWT authentication & role-based access control
router.use(authenticateToken);
router.use(requireRole('SELLER', 'SUPPLIER_REP'));

router.get('/dashboard', getSellerDashboard);
router.get('/inventory', getSellerInventory);
router.put('/inventory/:productId/stock', updateSellerStock);

// Product Catalogue routes
router.get('/products', getMyProducts);
router.post('/products', createProduct);
router.put('/products/:productId', updateProduct);
router.delete('/products/:productId', deleteProduct);

// Settings routes
router.get('/settings', getSellerSettings);
router.put('/settings/business', updateBusinessSettings);
router.put('/settings/agent', updateAgentSettings);

export default router;
