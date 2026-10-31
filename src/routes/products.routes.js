import { Router } from 'express';
import { getProducts, getProductById, updateInventory } from '../controllers/products.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { productQuerySchema } from '../modules/products/products.schema.js';

const router = Router();
router.get('/', validateRequest({ query: productQuerySchema }), getProducts);
router.get('/:id', getProductById);
router.patch('/:id/inventory', updateInventory);

export default router;
