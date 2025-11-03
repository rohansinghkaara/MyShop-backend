const { container } = require('../container/serviceRegistration');
const logger = require('../utils/logger');
const sequelize = require('../config/database');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res, next) => {
  const startTime = Date.now();
  
  // Start transaction for atomicity
  const transaction = await sequelize.transaction();
  
  try {
    const cartService = container.resolve('cartService');
    const productRepository = container.resolve('productRepository');
    const { shippingAddress, paymentMethod } = req.body;
    
    // Validate and get cart with stock validation
    const cartValidation = await cartService.validateCartForCheckout(req.user.id);
    
    if (!cartValidation.isValid) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Cart validation failed',
        timestamp: new Date().toISOString()
      });
    }
    
    const cart = cartValidation.cart;
    
    if (!cart.items || cart.items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Cart is empty',
        timestamp: new Date().toISOString()
      });
    }
    
    // Prepare order data with atomic stock updates
    let totalAmount = 0;
    const orderItems = [];
    
    // Process each cart item with row-level locking to prevent race conditions
    for (const item of cart.items) {
      // Lock product row for update (prevents concurrent modifications)
      const product = await productRepository.model.findByPk(item.productId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `Product ${item.productId} not found`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Double-check stock with locked row (prevents race condition)
      if (product.stock < item.quantity) {
        await transaction.rollback();
        logger.logSecurity('Stock manipulation attempt detected', {
          userId: req.user.id,
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableStock: product.stock,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent')
        });
        return res.status(400).json({ 
          success: false, 
          message: `${product.name} does not have enough items in stock. Available: ${product.stock}, Requested: ${item.quantity}`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Atomically update stock (prevents overselling)
      const [updatedRows] = await productRepository.model.update(
        { stock: product.stock - item.quantity },
        { 
          where: { 
            id: product.id,
            stock: { [sequelize.Op.gte]: item.quantity } // Additional safety check
          },
          transaction
        }
      );
      
      // Verify stock was actually updated (additional race condition protection)
      if (updatedRows === 0) {
        await transaction.rollback();
        logger.logSecurity('Concurrent stock modification detected', {
          userId: req.user.id,
          productId: item.productId,
          requestedQuantity: item.quantity,
          ip: req.ip || req.connection.remoteAddress
        });
        return res.status(409).json({ 
          success: false, 
          message: `Inventory conflict for ${product.name}. Please refresh and try again.`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Add to order items
      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
        productName: product.name
      });
      
      // Update total
      totalAmount += parseFloat(product.price) * item.quantity;
    }
    
    // Create order with transaction
    const Order = require('../models/Order');
    const order = await Order.create({
      userId: req.user.id,
      items: JSON.stringify(orderItems), // Store order items as JSON
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      shippingAddress: JSON.stringify(shippingAddress),
      paymentMethod,
      status: 'pending'
    }, { transaction });
    
    // Clear user cart within transaction
    await cartService.clearUserCart(req.user.id);
    
    // Commit transaction (all operations succeed together)
    await transaction.commit();
    
    logger.info('Order created successfully', {
      userId: req.user.id,
      orderId: order.id,
      totalAmount,
      itemCount: orderItems.length,
      timestamp: new Date().toISOString()
    });
    
    logger.logRequest(req, res, Date.now() - startTime);
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        ...order.toJSON(),
        items: orderItems
      }
    });
    
  } catch (error) {
    // Rollback transaction on any error
    await transaction.rollback();
    
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    let query;
    
    // If user is admin, get all orders, otherwise get only user's orders
    if (req.user.role === 'admin') {
      query = Order.find().populate('user', 'name email');
    } else {
      query = Order.find({ user: req.user.id });
    }
    
    const orders = await query;
    
    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('products.product');
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Check if user is owner or admin
    if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to access this order' });
    }
    
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id
// @access  Private (Admin)
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    order.status = status;
    await order.save();
    
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.logError(error, req);
    next(error); // Pass to global error handler
  }
};