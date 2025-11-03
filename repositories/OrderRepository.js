const BaseRepository = require('./BaseRepository');
const { Order, OrderItem } = require('../models/Order');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class OrderRepository extends BaseRepository {
  constructor() {
    super(Order);
  }

  async createOrder(orderData, orderItems, transaction = null) {
    try {
      const options = transaction ? { transaction } : {};
      
      // Create the order
      const order = await this.model.create(orderData, options);
      
      // Create order items
      const itemsWithOrderId = orderItems.map(item => ({
        ...item,
        orderId: order.id
      }));
      
      await OrderItem.bulkCreate(itemsWithOrderId, options);
      
      // Fetch the complete order with items
      return await this.findOrderById(order.id, transaction);
    } catch (error) {
      logger.error('Error creating order in repository:', error);
      throw error;
    }
  }

  async findOrderById(orderId, transaction = null) {
    try {
      const options = {
        include: [
          {
            model: OrderItem,
            as: 'items'
          }
        ]
      };
      
      if (transaction) {
        options.transaction = transaction;
      }
      
      return await this.model.findByPk(orderId, options);
    } catch (error) {
      logger.error('Error finding order by ID:', error);
      throw error;
    }
  }

  async findOrdersByUserId(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status = null,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = options;

      const whereClause = { userId };
      if (status) {
        whereClause.status = status;
      }

      const queryOptions = {
        where: whereClause,
        include: [
          {
            model: OrderItem,
            as: 'items'
          }
        ],
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      };

      const result = await this.model.findAndCountAll(queryOptions);
      
      return {
        orders: result.rows,
        totalCount: result.count,
        totalPages: Math.ceil(result.count / limit),
        currentPage: parseInt(page),
        hasNext: page * limit < result.count,
        hasPrev: page > 1
      };
    } catch (error) {
      logger.error('Error finding orders by user ID:', error);
      throw error;
    }
  }

  async findAllOrders(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status = null,
        startDate = null,
        endDate = null,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = options;

      const whereClause = {};
      
      if (status) {
        whereClause.status = status;
      }
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt[Op.lte] = new Date(endDate);
        }
      }

      const queryOptions = {
        where: whereClause,
        include: [
          {
            model: OrderItem,
            as: 'items'
          }
        ],
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      };

      const result = await this.model.findAndCountAll(queryOptions);
      
      return {
        orders: result.rows,
        totalCount: result.count,
        totalPages: Math.ceil(result.count / limit),
        currentPage: parseInt(page),
        hasNext: page * limit < result.count,
        hasPrev: page > 1
      };
    } catch (error) {
      logger.error('Error finding all orders:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status, transaction = null) {
    try {
      const options = transaction ? { transaction } : {};
      
      const [updatedRows] = await this.model.update(
        { 
          status,
          updatedAt: new Date()
        },
        {
          where: { id: orderId },
          ...options
        }
      );

      if (updatedRows === 0) {
        throw new Error('Order not found or not updated');
      }

      return await this.findOrderById(orderId, transaction);
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  async updatePaymentStatus(orderId, paymentStatus, transaction = null) {
    try {
      const options = transaction ? { transaction } : {};
      
      const [updatedRows] = await this.model.update(
        { 
          paymentStatus,
          updatedAt: new Date()
        },
        {
          where: { id: orderId },
          ...options
        }
      );

      if (updatedRows === 0) {
        throw new Error('Order not found or not updated');
      }

      return await this.findOrderById(orderId, transaction);
    } catch (error) {
      logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  async cancelOrder(orderId, transaction = null) {
    try {
      const options = transaction ? { transaction } : {};
      
      // First check if order can be cancelled
      const order = await this.findOrderById(orderId, transaction);
      if (!order) {
        throw new Error('Order not found');
      }

      if (['shipped', 'delivered'].includes(order.status)) {
        throw new Error('Cannot cancel order that has been shipped or delivered');
      }

      const [updatedRows] = await this.model.update(
        { 
          status: 'cancelled',
          updatedAt: new Date()
        },
        {
          where: { id: orderId },
          ...options
        }
      );

      if (updatedRows === 0) {
        throw new Error('Order not found or not updated');
      }

      return await this.findOrderById(orderId, transaction);
    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  async getOrderAnalytics(startDate, endDate) {
    try {
      const whereClause = {};
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt[Op.lte] = new Date(endDate);
        }
      }

      const [
        totalOrders,
        totalRevenue,
        ordersByStatus,
        averageOrderValue
      ] = await Promise.all([
        // Total orders count
        this.model.count({ where: whereClause }),
        
        // Total revenue
        this.model.sum('totalAmount', { where: whereClause }),
        
        // Orders by status
        this.model.findAll({
          where: whereClause,
          attributes: [
            'status',
            [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count'],
            [this.model.sequelize.fn('SUM', this.model.sequelize.col('totalAmount')), 'revenue']
          ],
          group: ['status'],
          raw: true
        }),
        
        // Average order value
        this.model.findOne({
          where: whereClause,
          attributes: [
            [this.model.sequelize.fn('AVG', this.model.sequelize.col('totalAmount')), 'average']
          ],
          raw: true
        })
      ]);

      return {
        totalOrders: totalOrders || 0,
        totalRevenue: parseFloat(totalRevenue) || 0,
        averageOrderValue: parseFloat(averageOrderValue?.average) || 0,
        ordersByStatus: ordersByStatus.reduce((acc, item) => {
          acc[item.status] = {
            count: parseInt(item.count),
            revenue: parseFloat(item.revenue) || 0
          };
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Error getting order analytics:', error);
      throw error;
    }
  }

  async getTopProducts(limit = 10, startDate = null, endDate = null) {
    try {
      const whereClause = {};
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt[Op.lte] = new Date(endDate);
        }
      }

      const topProducts = await OrderItem.findAll({
        include: [
          {
            model: Order,
            where: whereClause,
            attributes: []
          }
        ],
        attributes: [
          'productId',
          'productName',
          [OrderItem.sequelize.fn('SUM', OrderItem.sequelize.col('quantity')), 'totalQuantity'],
          [OrderItem.sequelize.fn('SUM', 
            OrderItem.sequelize.literal('quantity * price')
          ), 'totalRevenue'],
          [OrderItem.sequelize.fn('COUNT', OrderItem.sequelize.col('OrderItem.id')), 'orderCount']
        ],
        group: ['productId', 'productName'],
        order: [[OrderItem.sequelize.fn('SUM', OrderItem.sequelize.col('quantity')), 'DESC']],
        limit: parseInt(limit),
        raw: true
      });

      return topProducts.map(product => ({
        productId: product.productId,
        productName: product.productName,
        totalQuantity: parseInt(product.totalQuantity),
        totalRevenue: parseFloat(product.totalRevenue),
        orderCount: parseInt(product.orderCount)
      }));
    } catch (error) {
      logger.error('Error getting top products:', error);
      throw error;
    }
  }

  async getRecentOrders(limit = 10) {
    try {
      return await this.model.findAll({
        include: [
          {
            model: OrderItem,
            as: 'items'
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit)
      });
    } catch (error) {
      logger.error('Error getting recent orders:', error);
      throw error;
    }
  }

  async findOrdersByProduct(productId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status = null
      } = options;

      const whereClause = {};
      if (status) {
        whereClause.status = status;
      }

      const queryOptions = {
        include: [
          {
            model: OrderItem,
            as: 'items',
            where: { productId },
            required: true
          }
        ],
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      };

      const result = await this.model.findAndCountAll(queryOptions);
      
      return {
        orders: result.rows,
        totalCount: result.count,
        totalPages: Math.ceil(result.count / limit),
        currentPage: parseInt(page)
      };
    } catch (error) {
      logger.error('Error finding orders by product:', error);
      throw error;
    }
  }
}

module.exports = OrderRepository;