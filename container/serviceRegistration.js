const { container, createFactory } = require('./DIContainer');

// Import repositories
const UserRepository = require('../repositories/UserRepository');
const ProductRepository = require('../repositories/ProductRepository');
const CartRepository = require('../repositories/CartRepository');
const OrderRepository = require('../repositories/OrderRepository');

// Import services
const UserService = require('../services/UserService');
const CartService = require('../services/CartService');
const CacheService = require('../services/CacheService');
const ProductService = require('../services/ProductService');
const OrderService = require('../services/OrderService');
const PaymentService = require('../services/PaymentService');
const InventoryService = require('../services/InventoryService');
const NotificationService = require('../services/NotificationService');

// Import utils
const logger = require('../utils/logger');

// Register repositories as singletons
container.registerSingleton('userRepository', createFactory(UserRepository));
container.registerSingleton('productRepository', createFactory(ProductRepository));
container.registerSingleton('cartRepository', createFactory(CartRepository));
container.registerSingleton('orderRepository', createFactory(OrderRepository));

// Register core services
container.registerSingleton('cacheService', createFactory(CacheService));
container.registerSingleton('notificationService', createFactory(NotificationService));
container.registerSingleton('paymentService', createFactory(PaymentService));

// Register business services with their dependencies
container.registerSingleton('userService', createFactory(UserService), ['userRepository']);
container.registerSingleton('cartService', createFactory(CartService), ['cartRepository', 'productRepository']);
container.registerSingleton('productService', createFactory(ProductService), ['productRepository', 'cacheService']);
container.registerSingleton('inventoryService', createFactory(InventoryService), ['productRepository', 'cacheService', 'notificationService']);
container.registerSingleton('orderService', createFactory(OrderService), ['orderRepository', 'cartService', 'productRepository', 'paymentService', 'notificationService']);

// Register utilities
container.registerInstance('logger', logger);

// Helper function to get all services
const getServices = () => ({
  // Repositories
  userRepository: container.resolve('userRepository'),
  productRepository: container.resolve('productRepository'),
  cartRepository: container.resolve('cartRepository'),
  orderRepository: container.resolve('orderRepository'),
  
  // Core services
  cacheService: container.resolve('cacheService'),
  notificationService: container.resolve('notificationService'),
  paymentService: container.resolve('paymentService'),
  
  // Business services
  userService: container.resolve('userService'),
  cartService: container.resolve('cartService'),
  productService: container.resolve('productService'),
  inventoryService: container.resolve('inventoryService'),
  orderService: container.resolve('orderService'),
  
  // Utilities
  logger: container.resolve('logger')
});

// Validation function to ensure all services are properly registered
const validateContainer = () => {
  const requiredServices = [
    // Repositories
    'userRepository',
    'productRepository', 
    'cartRepository',
    'orderRepository',
    
    // Core services
    'cacheService',
    'notificationService',
    'paymentService',
    
    // Business services
    'userService',
    'cartService',
    'productService',
    'inventoryService',
    'orderService',
    
    // Utilities
    'logger'
  ];

  const missing = requiredServices.filter(service => !container.has(service));
  
  if (missing.length > 0) {
    throw new Error(`Missing required services: ${missing.join(', ')}`);
  }

  return true;
};

// Initialize container with error handling
const initializeContainer = () => {
  try {
    validateContainer();
    console.log('✅ Dependency injection container initialized successfully');
    console.log(`📦 Registered services: ${container.getRegisteredServices().join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize dependency injection container:', error.message);
    throw error;
  }
};

module.exports = {
  container,
  getServices,
  validateContainer,
  initializeContainer
};