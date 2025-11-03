const { container } = require('../container/serviceRegistration');
const logger = require('../utils/logger');

// @desc    Get all products with caching
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { category, search, minPrice, maxPrice, inStock, is_new, is_sale, sortBy, sortOrder } = req.query;

    // If a search term is provided, delegate to searchProducts
    if (search) {
      return exports.searchProducts(req, res, next);
    }
    
    // Generate cache key based on query parameters
    const cacheKey = cacheService.generateKey(
      'products', 
      'paginated', 
      page, 
      limit, 
      category || 'all',
      search || 'none',
      minPrice || 'none',
      maxPrice || 'none',
      inStock || 'none',
      is_new || 'none',
      is_sale || 'none',
      sortBy || 'createdAt',
      sortOrder || 'DESC'
    );

    // Direct fetch (cache temporarily bypassed for debugging timeouts)
    const filters = { category, search, minPrice, maxPrice, inStock, is_new, is_sale, sortBy, sortOrder };
    const result = await productRepository.findProductsWithPagination(page, limit, filters);
    const totalPages = Math.ceil(result.count / limit);
    const cachedResult = {
      products: result.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: result.count,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      data: cachedResult.products,
      pagination: cachedResult.pagination,
      cached: false
    });
  } catch (error) {
    console.error('!!! DETAILED ERROR in getProducts !!!', error); // Detailed logging
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Get single product with caching
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const productId = req.params.id;
    const cacheKey = cacheService.generateKey('product', productId);

    const product = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const product = await productRepository.findProductById(productId);
        if (!product) {
          throw new Error('Product not found');
        }
        return product;
      },
      600 // 10 minutes cache for individual products
    );

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Create product (admin only)
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const product = await productRepository.createProduct(req.body);

    // Invalidate relevant caches
    await cacheService.invalidateByPattern('products:*');

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Update product (admin only)
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const productId = req.params.id;
    const updatedProduct = await productRepository.updateProduct(productId, req.body);

    // Invalidate specific product cache and related caches
    await cacheService.invalidateProduct(productId);

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Delete product (admin only)
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const productId = req.params.id;
    await productRepository.deleteProduct(productId);

    // Invalidate all product-related caches
    await cacheService.invalidateProduct(productId);

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Get product categories with caching
// @route   GET /api/products/categories
// @access  Public
exports.getCategories = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    // const cacheService = container.resolve('cacheService');
    
    // Bypassing cache for debugging
    const categories = await productRepository.getCategories();

    /*
    const categories = await cacheService.getOrSet(
      'products:categories',
      async () => {
        return await productRepository.getCategories();
      },
      7200 // 2 hours cache for categories
    );
    */

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Search products with caching
// @route   GET /api/products/search
// @access  Public
exports.searchProducts = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const { q: searchTerm, page = 1, limit = 10 } = req.query;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }

    const cacheKey = cacheService.generateKey('products', 'search', searchTerm, page, limit);

    const result = await cacheService.getOrSet(
      cacheKey,
      async () => {
        return await productRepository.searchProducts(searchTerm, {
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit)
        });
      },
      180 // 3 minutes cache for search results
    );

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(result.count / limit),
        totalItems: result.count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Get cache statistics (admin only)
// @route   GET /api/products/cache/stats
// @access  Private/Admin
exports.getCacheStats = async (req, res, next) => {
  try {
    const cacheService = container.resolve('cacheService');
    const stats = await cacheService.getStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Clear product cache (admin only)
// @route   DELETE /api/products/cache
// @access  Private/Admin
exports.clearCache = async (req, res, next) => {
  try {
    const cacheService = container.resolve('cacheService');
    await cacheService.invalidateByPattern('products:*');

    res.status(200).json({
      success: true,
      message: 'Product cache cleared successfully'
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Get new products
// @route   GET /api/products/new
// @access  Public
exports.getNewProducts = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const limit = parseInt(req.query.limit, 10) || 8;
    const cacheKey = cacheService.generateKey('products', 'new', limit);

    const products = await cacheService.getOrSet(
      cacheKey,
      async () => {
        return await productRepository.getNewProducts(limit);
      },
      300 // 5 minutes cache
    );

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.logError(error, req);
    next(error);
  }
};

// @desc    Get sale products
// @route   GET /api/products/sale
// @access  Public
exports.getSaleProducts = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const productRepository = container.resolve('productRepository');
    const cacheService = container.resolve('cacheService');
    
    const limit = parseInt(req.query.limit, 10) || 8;
    const cacheKey = cacheService.generateKey('products', 'sale', limit);

    const products = await cacheService.getOrSet(
      cacheKey,
      async () => {
        return await productRepository.getSaleProducts(limit);
      },
      300 // 5 minutes cache
    );

    logger.logRequest(req, res, Date.now() - startTime);

    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.logError(error, req);
    next(error);
  }
};