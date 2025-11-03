const { Order, OrderItem } = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const razorpayService = require('../services/razorpayService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class CheckoutController {
  /**
   * Create a new order and Razorpay order
   * @route POST /api/checkout/create-order
   * @access Private
   */
  async createOrder(req, res) {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            details: errors.array()
          }
        });
      }

      const { items, address } = req.body;
      const userId = req.user.id;

      // Validate cart items
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Cart items are required',
            statusCode: 400,
            code: 'INVALID_CART'
          }
        });
      }

      // Validate address
      if (!address || !address.name || !address.email || !address.phone || !address.address) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Complete address information is required',
            statusCode: 400,
            code: 'INVALID_ADDRESS'
          }
        });
      }

      // Check if Razorpay is configured
      if (!razorpayService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: {
            message: 'Payment service is not available',
            statusCode: 503,
            code: 'PAYMENT_SERVICE_UNAVAILABLE'
          }
        });
      }

      // Validate products and calculate total
      let totalAmountPaise = 0;
      const validatedItems = [];

      for (const item of items) {
        const product = await Product.findByPk(item.productId);
        
        if (!product) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Product with ID ${item.productId} not found`,
              statusCode: 400,
              code: 'PRODUCT_NOT_FOUND'
            }
          });
        }

        if (product.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Insufficient stock for product: ${product.name}`,
              statusCode: 400,
              code: 'INSUFFICIENT_STOCK'
            }
          });
        }

        // Use sale price if available, otherwise regular price
        const unitPricePaise = product.sale_price_paise || product.price_paise;
        const itemTotal = unitPricePaise * item.quantity;
        
        validatedItems.push({
          productId: product.id,
          quantity: item.quantity,
          unitPricePaise: unitPricePaise,
          productName: product.name,
          productDescription: product.description
        });

        totalAmountPaise += itemTotal;
      }

      // Generate unique receipt ID
      const receipt = `receipt_${Date.now()}_${userId}`;

      // Create Razorpay order
      const razorpayOrder = await razorpayService.createOrder(
        totalAmountPaise,
        'INR',
        receipt,
        {
          userId: userId.toString(),
          orderType: 'ecommerce'
        }
      );

      // Create database order
      const order = await Order.create({
        userId: userId,
        total_amount_paise: totalAmountPaise,
        currency: 'INR',
        status: 'pending',
        razorpay_order_id: razorpayOrder.id,
        receipt: receipt,
        address_json: address
      });

      // Create order items
      const orderItems = await Promise.all(
        validatedItems.map(item => 
          OrderItem.create({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unit_price_paise: item.unitPricePaise,
            productName: item.productName,
            productDescription: item.productDescription
          })
        )
      );

      // Update product stock
      await Promise.all(
        validatedItems.map(item => 
          Product.decrement('stock', {
            by: item.quantity,
            where: { id: item.productId }
          })
        )
      );

      logger.info('Order created successfully', {
        orderId: order.id,
        userId: userId,
        totalAmountPaise: totalAmountPaise,
        razorpayOrderId: razorpayOrder.id,
        itemCount: validatedItems.length
      });

      res.status(201).json({
        success: true,
        data: {
          orderId: order.id,
          razorpayOrderId: razorpayOrder.id,
          amount: totalAmountPaise,
          currency: 'INR',
          receipt: receipt
        }
      });

    } catch (error) {
      logger.error('Error creating order', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create order',
          statusCode: 500,
          code: 'ORDER_CREATION_FAILED'
        }
      });
    }
  }

  /**
   * Verify Razorpay payment and update order status
   * @route POST /api/checkout/verify
   * @access Private
   */
  async verifyPayment(req, res) {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            details: errors.array()
          }
        });
      }

      const { 
        razorpay_order_id, 
        razorpay_payment_id, 
        razorpay_signature,
        orderId 
      } = req.body;

      const userId = req.user.id;

      // Find the order
      const order = await Order.findOne({
        where: {
          id: orderId,
          userId: userId,
          status: 'pending'
        }
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Order not found or already processed',
            statusCode: 404,
            code: 'ORDER_NOT_FOUND'
          }
        });
      }

      // Verify Razorpay signature
      const isValidSignature = razorpayService.verifySignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValidSignature) {
        logger.logSecurity('Invalid Razorpay signature', {
          userId: userId,
          orderId: orderId,
          razorpayOrderId: razorpay_order_id,
          ip: req.ip
        });

        // Update order status to failed
        await order.update({
          status: 'failed',
          razorpay_payment_id: razorpay_payment_id,
          razorpay_signature: razorpay_signature
        });

        return res.status(400).json({
          success: false,
          error: {
            message: 'Payment verification failed',
            statusCode: 400,
            code: 'PAYMENT_VERIFICATION_FAILED'
          }
        });
      }

      // Update order status to paid
      await order.update({
        status: 'paid',
        razorpay_payment_id: razorpay_payment_id,
        razorpay_signature: razorpay_signature
      });

      logger.info('Payment verified successfully', {
        orderId: order.id,
        userId: userId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      });

      res.json({
        success: true,
        data: {
          orderId: order.id,
          status: 'paid',
          message: 'Payment verified successfully'
        }
      });

    } catch (error) {
      logger.error('Error verifying payment', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to verify payment',
          statusCode: 500,
          code: 'PAYMENT_VERIFICATION_FAILED'
        }
      });
    }
  }

  /**
   * Handle Razorpay webhook events
   * @route POST /api/razorpay/webhook
   * @access Public (with signature verification)
   */
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const webhookBody = JSON.stringify(req.body);

      if (!signature) {
        logger.logSecurity('Webhook request without signature', {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return res.status(400).json({ success: false, message: 'Missing signature' });
      }

      // Verify webhook signature
      const isValidSignature = razorpayService.verifyWebhookSignature(webhookBody, signature);
      
      if (!isValidSignature) {
        logger.logSecurity('Invalid webhook signature', {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }

      const event = req.body;

      logger.info('Razorpay webhook received', {
        event: event.event,
        orderId: event.payload?.order?.entity?.id,
        paymentId: event.payload?.payment?.entity?.id
      });

      // Handle different webhook events
      switch (event.event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(event.payload);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(event.payload);
          break;
        case 'order.paid':
          await this.handleOrderPaid(event.payload);
          break;
        default:
          logger.info('Unhandled webhook event', { event: event.event });
      }

      res.json({ success: true, message: 'Webhook processed' });

    } catch (error) {
      logger.error('Error processing webhook', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Webhook processing failed'
      });
    }
  }

  /**
   * Handle payment captured webhook
   */
  async handlePaymentCaptured(payload) {
    try {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;

      const order = await Order.findOne({
        where: { razorpay_order_id: orderId }
      });

      if (order && order.status === 'pending') {
        await order.update({
          status: 'paid',
          razorpay_payment_id: payment.id,
          razorpay_signature: payment.signature
        });

        logger.info('Order status updated via webhook', {
          orderId: order.id,
          razorpayOrderId: orderId,
          razorpayPaymentId: payment.id
        });
      }
    } catch (error) {
      logger.error('Error handling payment captured webhook', {
        error: error.message,
        payload: payload
      });
    }
  }

  /**
   * Handle payment failed webhook
   */
  async handlePaymentFailed(payload) {
    try {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;

      const order = await Order.findOne({
        where: { razorpay_order_id: orderId }
      });

      if (order && order.status === 'pending') {
        await order.update({
          status: 'failed',
          razorpay_payment_id: payment.id
        });

        logger.info('Order status updated to failed via webhook', {
          orderId: order.id,
          razorpayOrderId: orderId,
          razorpayPaymentId: payment.id
        });
      }
    } catch (error) {
      logger.error('Error handling payment failed webhook', {
        error: error.message,
        payload: payload
      });
    }
  }

  /**
   * Handle order paid webhook
   */
  async handleOrderPaid(payload) {
    try {
      const order = payload.order.entity;
      const orderId = order.id;

      const dbOrder = await Order.findOne({
        where: { razorpay_order_id: orderId }
      });

      if (dbOrder && dbOrder.status === 'pending') {
        await dbOrder.update({
          status: 'paid'
        });

        logger.info('Order status updated to paid via webhook', {
          orderId: dbOrder.id,
          razorpayOrderId: orderId
        });
      }
    } catch (error) {
      logger.error('Error handling order paid webhook', {
        error: error.message,
        payload: payload
      });
    }
  }

  /**
   * Get Razorpay configuration for frontend
   * @route GET /api/checkout/config
   * @access Public
   */
  async getConfig(req, res) {
    try {
      const config = razorpayService.getFrontendConfig();

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error getting Razorpay config', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get payment configuration',
          statusCode: 500,
          code: 'CONFIG_ERROR'
        }
      });
    }
  }
}

module.exports = new CheckoutController();
