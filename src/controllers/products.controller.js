import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';

export async function getProducts(req, res, next) {
  try {
    const { category, search, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (category && category !== 'ALL') where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const takeCount = parseInt(limit, 10) || 50;
    const skipCount = parseInt(offset, 10) || 0;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { inventory: true },
        take: takeCount,
        skip: skipCount,
        orderBy: { sku: 'asc' },
      }),
      prisma.product.count({ where }),
    ]);

    return sendSuccess(res, { products, total, limit: takeCount, offset: skipCount }, 'Products retrieved from database');
  } catch (error) {
    next(error);
  }
}

export async function getProductById(req, res, next) {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        business: { select: { id: true, name: true, businessType: true, contactEmail: true } },
      },
    });

    if (!product) {
      return sendError(res, `Product with ID [${id}] not found in database`, 404, 'NotFound');
    }

    return sendSuccess(res, product, 'Product details retrieved from database');
  } catch (error) {
    next(error);
  }
}

export async function updateInventory(req, res, next) {
  try {
    const { id } = req.params;
    const { stockQuantity, reservedQuantity, warehouseLocation } = req.body;

    const updatedInventory = await prisma.inventory.upsert({
      where: { productId: id },
      update: {
        ...(stockQuantity !== undefined && { stockQuantity: parseInt(stockQuantity, 10) }),
        ...(reservedQuantity !== undefined && { reservedQuantity: parseInt(reservedQuantity, 10) }),
        ...(warehouseLocation && { warehouseLocation }),
      },
      create: {
        productId: id,
        stockQuantity: parseInt(stockQuantity, 10) || 100,
        reservedQuantity: parseInt(reservedQuantity, 10) || 0,
        warehouseLocation: warehouseLocation || 'Main Hub - Mumbai',
      },
    });

    return sendSuccess(res, updatedInventory, 'Product inventory updated in database');
  } catch (error) {
    next(error);
  }
}
