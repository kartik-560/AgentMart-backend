import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { createProductSchema, updateProductSchema } from '../modules/products/products.schema.js';

async function resolveUserBusinessId(req) {
  if (req.user?.businessId) return req.user.businessId;
  if (req.user?.id) {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { businessId: true },
    });
    if (u?.businessId) return u.businessId;
  }
  if (req.user?.id) {
    const a = await prisma.agent.findFirst({
      where: { userId: req.user.id },
      select: { businessId: true },
    });
    if (a?.businessId) return a.businessId;
  }
  return null;
}

function formatProduct(product) {
  if (!product) return null;
  const meta = product.metadata && typeof product.metadata === 'object' ? product.metadata : {};
  return {
    ...product,
    imageUrl: meta.imageUrl || null,
    minOrderQty: meta.minOrderQty !== undefined ? Number(meta.minOrderQty) : 1,
    maxOrderQty: meta.maxOrderQty !== undefined ? Number(meta.maxOrderQty) : null,
    certifications: meta.certifications || '',
    warrantyPeriod: meta.warrantyPeriod || '',
    specifications: meta.specifications || '',
    features: meta.features || '',
  };
}

export async function getProducts(req, res, next) {
  try {
    const { category, search, limit = 50, offset = 0 } = req.query;
    const where = { isActive: true };
    if (category && category !== 'ALL') where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const takeCount = parseInt(limit, 10) || 50;
    const skipCount = parseInt(offset, 10) || 0;

    const [rawProducts, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          inventory: true,
          business: { select: { id: true, name: true, businessType: true, contactEmail: true } },
        },
        take: takeCount,
        skip: skipCount,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    const products = rawProducts.map(formatProduct);

    return sendSuccess(res, { products, total, limit: takeCount, offset: skipCount }, 'Products retrieved from database');
  } catch (error) {
    next(error);
  }
}

export async function getProductById(req, res, next) {
  try {
    const id = req.params.id || req.params.productId;
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

    return sendSuccess(res, formatProduct(product), 'Product details retrieved from database');
  } catch (error) {
    next(error);
  }
}

export async function getMyProducts(req, res, next) {
  try {
    const businessId = await resolveUserBusinessId(req);
    if (!businessId) {
      return sendError(res, 'No business associated with this seller account', 400, 'InvalidAccountState');
    }

    const rawProducts = await prisma.product.findMany({
      where: { businessId },
      include: {
        inventory: true,
        business: { select: { id: true, name: true, businessType: true, contactEmail: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const products = rawProducts.map(formatProduct);

    return sendSuccess(res, products, 'Seller products retrieved from database');
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req, res, next) {
  try {
    const businessId = await resolveUserBusinessId(req);
    if (!businessId) {
      return sendError(res, 'No verified business associated with this seller account', 400, 'InvalidAccountState');
    }

    // Zod validation
    const parseResult = createProductSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return sendError(
        res,
        firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Validation error',
        400,
        'ValidationError',
        parseResult.error.flatten()
      );
    }

    const {
      name,
      sku,
      category,
      description,
      imageUrl,
      unit,
      targetSellingPrice,
      minSellingPrice,
      baseCostPrice,
      stockQuantity,
      minOrderQty,
      maxOrderQty,
      warehouseLocation,
      typicalLeadTimeHours,
      qualityGrade,
      certifications,
      warrantyPeriod,
      specifications,
      features,
    } = parseResult.data;

    // Check SKU collision
    const existingProductWithSku = await prisma.product.findUnique({
      where: { sku: sku.trim().toUpperCase() },
      select: { id: true, businessId: true },
    });

    if (existingProductWithSku) {
      return sendError(
        res,
        `A product with SKU [${sku.trim().toUpperCase()}] already exists. Please choose a unique SKU.`,
        400,
        'DuplicateSku'
      );
    }

    const metadata = {
      imageUrl: imageUrl || null,
      minOrderQty: minOrderQty || 1,
      maxOrderQty: maxOrderQty || null,
      certifications: certifications || '',
      warrantyPeriod: warrantyPeriod || '',
      specifications: specifications || '',
      features: features || '',
    };

    const costPrice = baseCostPrice !== undefined && baseCostPrice !== null
      ? baseCostPrice
      : Math.round(minSellingPrice * 0.85); // Reasonable default internal cost if not specified

    const newProduct = await prisma.product.create({
      data: {
        businessId,
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        category: category.trim(),
        description: description?.trim() || `${qualityGrade} wholesale supply of ${name.trim()}.`,
        unit: unit.trim() || 'Unit',
        baseCostPrice: costPrice,
        minSellingPrice: minSellingPrice,
        targetSellingPrice: targetSellingPrice,
        qualityGrade: qualityGrade.trim(),
        typicalLeadTimeHours: typicalLeadTimeHours,
        isActive: true,
        metadata,
        inventory: {
          create: {
            stockQuantity: stockQuantity,
            reservedQuantity: 0,
            warehouseLocation: warehouseLocation.trim(),
            minThreshold: 10,
            restockLeadDays: Math.max(1, Math.ceil(typicalLeadTimeHours / 24)),
          },
        },
      },
      include: {
        inventory: true,
        business: {
          select: { id: true, name: true, businessType: true, contactEmail: true },
        },
      },
    });

    return sendSuccess(res, formatProduct(newProduct), 'Product created and inventory registered successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const businessId = await resolveUserBusinessId(req);
    const id = req.params.id || req.params.productId;

    const existing = await prisma.product.findFirst({
      where: { id, businessId },
      include: { inventory: true },
    });

    if (!existing) {
      return sendError(res, 'Product not found or you are not authorized to edit this product', 404, 'NotFound');
    }

    // Zod validation
    const parseResult = updateProductSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return sendError(
        res,
        firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Validation error',
        400,
        'ValidationError',
        parseResult.error.flatten()
      );
    }

    const {
      name,
      sku,
      category,
      description,
      imageUrl,
      unit,
      targetSellingPrice,
      minSellingPrice,
      baseCostPrice,
      stockQuantity,
      minOrderQty,
      maxOrderQty,
      warehouseLocation,
      typicalLeadTimeHours,
      qualityGrade,
      certifications,
      warrantyPeriod,
      specifications,
      features,
      isActive,
    } = parseResult.data;

    // Check SKU if changing
    if (sku && sku.trim().toUpperCase() !== existing.sku) {
      const collision = await prisma.product.findUnique({
        where: { sku: sku.trim().toUpperCase() },
      });
      if (collision && collision.id !== id) {
        return sendError(res, `SKU [${sku.trim().toUpperCase()}] is already in use by another product.`, 400, 'DuplicateSku');
      }
    }

    const currentMeta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
    const updatedMeta = {
      ...currentMeta,
      ...(imageUrl !== undefined && { imageUrl }),
      ...(minOrderQty !== undefined && { minOrderQty }),
      ...(maxOrderQty !== undefined && { maxOrderQty }),
      ...(certifications !== undefined && { certifications }),
      ...(warrantyPeriod !== undefined && { warrantyPeriod }),
      ...(specifications !== undefined && { specifications }),
      ...(features !== undefined && { features }),
    };

    const updateProductData = {
      ...(name && { name: name.trim() }),
      ...(sku && { sku: sku.trim().toUpperCase() }),
      ...(category && { category: category.trim() }),
      ...(description !== undefined && { description: description?.trim() }),
      ...(unit && { unit: unit.trim() }),
      ...(baseCostPrice !== undefined && { baseCostPrice }),
      ...(minSellingPrice !== undefined && { minSellingPrice }),
      ...(targetSellingPrice !== undefined && { targetSellingPrice }),
      ...(qualityGrade && { qualityGrade: qualityGrade.trim() }),
      ...(typicalLeadTimeHours !== undefined && { typicalLeadTimeHours }),
      ...(isActive !== undefined && { isActive }),
      metadata: updatedMeta,
    };

    await prisma.product.update({
      where: { id },
      data: updateProductData,
    });

    if (stockQuantity !== undefined || warehouseLocation !== undefined) {
      if (existing.inventory) {
        await prisma.inventory.update({
          where: { id: existing.inventory.id },
          data: {
            ...(stockQuantity !== undefined && { stockQuantity }),
            ...(warehouseLocation && { warehouseLocation: warehouseLocation.trim() }),
          },
        });
      } else {
        await prisma.inventory.create({
          data: {
            productId: id,
            stockQuantity: stockQuantity ?? 0,
            warehouseLocation: warehouseLocation || 'Main Central Hub - Mumbai',
          },
        });
      }
    }

    const updated = await prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        business: { select: { id: true, name: true, businessType: true, contactEmail: true } },
      },
    });

    return sendSuccess(res, formatProduct(updated), 'Product updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const businessId = await resolveUserBusinessId(req);
    const id = req.params.id || req.params.productId;

    const product = await prisma.product.findFirst({
      where: { id, businessId },
    });

    if (!product) {
      return sendError(res, 'Product not found or you are not authorized to delete this product', 404, 'NotFound');
    }

    const [negotiationCount, offerCount] = await Promise.all([
      prisma.negotiation.count({ where: { targetProductId: id } }),
      prisma.offer.count({ where: { productId: id } }),
    ]);

    if (negotiationCount > 0 || offerCount > 0) {
      await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
      return sendSuccess(
        res,
        { id, status: 'ARCHIVED', message: 'Product archived because of existing transaction history' },
        'Product marked inactive'
      );
    }

    await prisma.inventory.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });

    return sendSuccess(res, { id, status: 'DELETED' }, 'Product deleted successfully');
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
