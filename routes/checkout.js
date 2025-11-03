const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { validateCSRF } = require('../middleware/csrf');
const checkoutController = require('../controllers/checkoutController');
const { validateCheckoutOrder, validatePaymentVerification } = require('../middleware/validation');

// @route   POST /api/checkout/create-order
// @desc    Create a new order and Razorpay order
// @access  Private
// SECURITY: CSRF protection enabled
router.post('/create-order',
  protect,
  validateCSRF,
  validateCheckoutOrder,
  checkoutController.createOrder
);

// @route   POST /api/checkout/verify
// @desc    Verify Razorpay payment and update order status
// @access  Private
// SECURITY: CSRF protection enabled
router.post('/verify',
  protect,
  validateCSRF,
  validatePaymentVerification,
  checkoutController.verifyPayment
);

// @route   POST /api/razorpay/webhook
// @desc    Handle Razorpay webhook events
// @access  Public (with signature verification)
router.post('/webhook', 
  checkoutController.handleWebhook
);

// @route   GET /api/checkout/config
// @desc    Get Razorpay configuration for frontend
// @access  Public
router.get('/config', 
  checkoutController.getConfig
);

module.exports = router;
