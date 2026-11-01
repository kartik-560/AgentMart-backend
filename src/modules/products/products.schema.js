import { z } from 'zod';

export const productQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
  offset: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 0)),
});

export const createProductSchema = z.object({
  // Basic Information
  name: z.string().min(1, 'Product Name is required').max(255),
  sku: z.string().min(1, 'Product SKU is required').max(100),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional().default(''),
  imageUrl: z.string().optional().nullable(),
  unit: z.string().optional().default('Unit'),

  // Pricing & Inventory
  targetSellingPrice: z.coerce.number().positive('Unit Wholesale Price must be greater than 0'),
  minSellingPrice: z.coerce.number().positive('Minimum Selling Price must be greater than 0'),
  baseCostPrice: z.coerce.number().nonnegative('Base cost cannot be negative').optional(),
  stockQuantity: z.coerce.number().int().nonnegative('Available stock must be 0 or more').default(0),
  minOrderQty: z.coerce.number().int().positive('Minimum order quantity must be at least 1').default(1),
  maxOrderQty: z.coerce.number().int().positive().optional().nullable(),
  warehouseLocation: z.string().optional().default('Main Central Hub - Mumbai'),

  // Delivery & Quality
  typicalLeadTimeHours: z.coerce.number().int().positive('Estimated Delivery SLA must be at least 1 hour').default(24),
  qualityGrade: z.string().default('Enterprise'),
  certifications: z.string().optional().default(''),
  warrantyPeriod: z.string().optional().default(''),

  // Additional Information
  specifications: z.string().optional().default(''),
  features: z.string().optional().default(''),
}).refine((data) => data.minSellingPrice <= data.targetSellingPrice, {
  message: 'Minimum Selling Price floor (₹) cannot exceed Unit Wholesale Price (₹)',
  path: ['minSellingPrice'],
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sku: z.string().min(1).max(100).optional(),
  category: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  unit: z.string().optional(),

  targetSellingPrice: z.coerce.number().positive().optional(),
  minSellingPrice: z.coerce.number().positive().optional(),
  baseCostPrice: z.coerce.number().nonnegative().optional(),
  stockQuantity: z.coerce.number().int().nonnegative().optional(),
  minOrderQty: z.coerce.number().int().positive().optional(),
  maxOrderQty: z.coerce.number().int().positive().optional().nullable(),
  warehouseLocation: z.string().optional(),

  typicalLeadTimeHours: z.coerce.number().int().positive().optional(),
  qualityGrade: z.string().optional(),
  certifications: z.string().optional(),
  warrantyPeriod: z.string().optional(),

  specifications: z.string().optional(),
  features: z.string().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.minSellingPrice !== undefined && data.targetSellingPrice !== undefined) {
      return data.minSellingPrice <= data.targetSellingPrice;
    }
    return true;
  },
  {
    message: 'Minimum Selling Price floor (₹) cannot exceed Unit Wholesale Price (₹)',
    path: ['minSellingPrice'],
  }
);
