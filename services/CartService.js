const BaseService = require('./BaseService');
const CartRepository = require('../repositories/CartRepository');
const ProductRepository = require('../repositories/ProductRepository');
const logger = require('../utils/logger');

class CartService extends BaseService {
  constructor(
    cartRepository = new CartRepository(),
    productRepository = new ProductRepository()
  ) {
    super(cartRepository);
    this.cartRepository = cartRepository;
    this.productRepository = productRepository;
  }

  async getUserCart(userId) {
    try {
      let cart = await this.cartRepository.getCartWithCalculations(userId);
      
      if (!cart) {
        // Create empty cart if none exists
        const [newCart] = await this.cartRepository.findOrCreateUserCart(userId);
        cart = {
          ...newCart.toJSON(),
          items: [],
          totalItems: 0,
          totalPrice: 0
        };
      }

      return cart;
    } catch (error) {
      throw this.handleError(error, 'getUserCart');
    }
  }

  async addItemToCart(userId, productId, quantity = 1) {
    try {
      logger.info('Starting addItemToCart', { userId, productId, quantity });

      // Validate product exists and has sufficient stock
      const product = await this.productRepository.findById(productId);
      logger.info('Product found', { productId: product?.id, name: product?.name });

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.stock < quantity) {
        throw new Error(`Only ${product.stock} items available in stock`);
      }

      // Find or create user cart
      logger.info('Finding or creating cart for user', { userId });
      const [cart] = await this.cartRepository.findOrCreateUserCart(userId);
      logger.info('Cart found/created', { cartId: cart.id });

      // Check if product already in cart
      logger.info('Checking for existing cart item');
      const { CartItem } = require('../models/Cart');
      const existingItem = await CartItem.findOne({
        where: { cartId: cart.id, productId }
      });
      logger.info('Existing item check complete', { exists: !!existingItem });

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        if (product.stock < newQuantity) {
          throw new Error(`Only ${product.stock} items available in stock`);
        }
      }

      // Add item to cart
      // Convert price from paise to decimal (paise / 100)
      const priceInRupees = product.sale_price_paise || product.price_paise;
      const priceDecimal = priceInRupees / 100;
      logger.info('Adding item to cart', { cartId: cart.id, productId, quantity, price: priceDecimal });

      await this.cartRepository.addItemToCart(
        cart.id,
        productId,
        quantity,
        priceDecimal
      );
      logger.info('Item added to CartItem table');

      logger.info('Item added to cart', {
        userId,
        productId,
        quantity,
        productName: product.name,
        timestamp: new Date().toISOString()
      });

      // Return updated cart
      logger.info('Getting cart with calculations');
      const result = await this.cartRepository.getCartWithCalculations(userId);
      logger.info('Returning cart result');
      return result;
    } catch (error) {
      logger.error('Error in addItemToCart:', error);
      logger.logError(error, null);
      throw this.handleError(error, 'addItemToCart');
    }
  }

  async updateCartItemQuantity(userId, itemId, quantity) {
    try {
      if (!quantity || quantity < 1) {
        throw new Error('Quantity must be at least 1');
      }

      return await this.cartRepository.executeInTransaction(async (transaction) => {
        // Find cart item
        const cartItem = await this.cartRepository.findCartItem(itemId, userId, transaction);
        if (!cartItem) {
          throw new Error('Cart item not found');
        }

        // Check stock availability
        if (cartItem.Product.stock < quantity) {
          throw new Error(`Only ${cartItem.Product.stock} items available in stock`);
        }

        // Update quantity
        await this.cartRepository.updateCartItemQuantity(itemId, quantity, userId, transaction);

        logger.info('Cart item quantity updated', {
          userId,
          itemId,
          oldQuantity: cartItem.quantity,
          newQuantity: quantity,
          productName: cartItem.Product.name,
          timestamp: new Date().toISOString()
        });

        // Return the full updated cart
        return await this.cartRepository.getCartWithCalculations(userId, transaction);
      });
    } catch (error) {
      logger.logError(error, null);
      throw this.handleError(error, 'updateCartItemQuantity');
    }
  }

  async removeCartItem(userId, itemId) {
    try {
      const cartItem = await this.cartRepository.findCartItem(itemId, userId);
      if (!cartItem) {
        throw new Error('Cart item not found');
      }

      await this.cartRepository.removeCartItem(itemId, userId);

      logger.info('Item removed from cart', {
        userId,
        itemId,
        productName: cartItem.Product.name,
        quantity: cartItem.quantity,
        timestamp: new Date().toISOString()
      });

      // Return the full updated cart
      return await this.cartRepository.getCartWithCalculations(userId);
    } catch (error) {
      logger.logError(error, null);
      throw this.handleError(error, 'removeCartItem');
    }
  }

  async clearUserCart(userId) {
    try {
      return await this.cartRepository.executeInTransaction(async (transaction) => {
        const cart = await this.cartRepository.findUserCart(userId, true);
        if (!cart) {
          throw new Error('Cart not found');
        }

        const itemCount = cart.items ? cart.items.length : 0;
        
        await this.cartRepository.clearUserCart(userId, transaction);

        logger.info('Cart cleared', {
          userId,
          itemsRemoved: itemCount,
          timestamp: new Date().toISOString()
        });

        return { message: 'Cart cleared successfully' };
      });
    } catch (error) {
      logger.logError(error, null);
      throw this.handleError(error, 'clearUserCart');
    }
  }

  async validateCartForCheckout(userId) {
    try {
      const cart = await this.cartRepository.findUserCart(userId, true);
      
      if (!cart || !cart.items || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      const validation = await this.cartRepository.validateCartStock(userId);
      
      if (!validation.isValid) {
        const errors = validation.errors.map(error => 
          `${error.productName}: requested ${error.requestedQuantity}, available ${error.availableStock}`
        );
        throw new Error(`Stock validation failed: ${errors.join(', ')}`);
      }

      // Calculate totals
      const totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      const totalPrice = cart.items.reduce((total, item) => {
        return total + (item.quantity * parseFloat(item.price));
      }, 0);

      return {
        isValid: true,
        cart: {
          ...cart.toJSON(),
          totalItems,
          totalPrice: parseFloat(totalPrice.toFixed(2))
        }
      };
    } catch (error) {
      throw this.handleError(error, 'validateCartForCheckout');
    }
  }

  async removeOutOfStockItems(userId) {
    try {
      return await this.cartRepository.executeInTransaction(async (transaction) => {
        const removedItems = await this.cartRepository.removeOutOfStockItems(userId, transaction);
        
        if (removedItems.length > 0) {
          logger.info('Out of stock items removed from cart', {
            userId,
            removedItems,
            timestamp: new Date().toISOString()
          });
        }

        return {
          removedItems,
          message: removedItems.length > 0 
            ? `${removedItems.length} out of stock items removed from cart`
            : 'No out of stock items found'
        };
      });
    } catch (error) {
      logger.logError(error, null);
      throw this.handleError(error, 'removeOutOfStockItems');
    }
  }

  async getCartStatistics(userId) {
    try {
      const cart = await this.cartRepository.findUserCart(userId, true);
      
      if (!cart || !cart.items) {
        return {
          totalItems: 0,
          totalPrice: 0,
          uniqueProducts: 0,
          averageItemPrice: 0
        };
      }

      const totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      const totalPrice = cart.items.reduce((total, item) => {
        return total + (item.quantity * parseFloat(item.price));
      }, 0);
      const uniqueProducts = cart.items.length;
      const averageItemPrice = uniqueProducts > 0 ? totalPrice / totalItems : 0;

      return {
        totalItems,
        totalPrice: parseFloat(totalPrice.toFixed(2)),
        uniqueProducts,
        averageItemPrice: parseFloat(averageItemPrice.toFixed(2))
      };
    } catch (error) {
      throw this.handleError(error, 'getCartStatistics');
    }
  }

  async syncCartWithStock(userId) {
    try {
      return await this.cartRepository.executeInTransaction(async (transaction) => {
        const cart = await this.cartRepository.findUserCart(userId, true);
        
        if (!cart || !cart.items) {
          return { updated: [], removed: [] };
        }

        const updated = [];
        const removed = [];

        for (const item of cart.items) {
          if (item.Product.stock === 0) {
            // Remove out of stock items
            await this.cartRepository.removeCartItem(item.id, userId);
            removed.push({
              productName: item.Product.name,
              quantity: item.quantity
            });
          } else if (item.quantity > item.Product.stock) {
            // Update quantity to available stock
            await this.cartRepository.updateCartItemQuantity(
              item.id,
              item.Product.stock,
              userId,
              transaction
            );
            updated.push({
              productName: item.Product.name,
              oldQuantity: item.quantity,
              newQuantity: item.Product.stock
            });
          }
        }

        logger.info('Cart synced with stock', {
          userId,
          updatedItems: updated.length,
          removedItems: removed.length,
          timestamp: new Date().toISOString()
        });

        return { updated, removed };
      });
    } catch (error) {
      logger.logError(error, null);
      throw this.handleError(error, 'syncCartWithStock');
    }
  }
}

module.exports = CartService;