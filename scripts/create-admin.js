/**
 * Script to create an admin user
 * Usage: node scripts/create-admin.js
 */

const sequelize = require('../config/database');
const User = require('../models/User');
const logger = require('../utils/logger');
const hello = "";s

/**
 * Create admin user
 */
async function createAdmin() {
  try {
    // Connect to database
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models
    await sequelize.sync();
    logger.info('Database synchronized');

    // Admin credentials
    const adminData = {
      name: 'Admin User',
      email: 'admin@myshop.com',
      password: 'Admin@123',
      role: 'admin',
      isActive: true
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      where: { email: adminData.email }
    });

    if (existingAdmin) {
      logger.warn(`Admin user already exists: ${adminData.email}`);
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log('║         ADMIN USER ALREADY EXISTS!                 ║');
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`\nEmail: ${adminData.email}`);
      console.log('Password: Admin@123 (if not changed)');
      console.log('\nNote: If you forgot the password, delete the user from');
      console.log('      the database and run this script again.\n');
      process.exit(0);
    }

    // Create admin user
    // Note: Password will be hashed automatically by the beforeCreate hook in User model
    const admin = await User.create(adminData);

    logger.info('Admin user created successfully', {
      id: admin.id,
      email: admin.email,
      role: admin.role
    });

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║       ADMIN USER CREATED SUCCESSFULLY! ✓          ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('\n📧 Admin Credentials:');
    console.log('   ┌─────────────────────────────────────────────┐');
    console.log(`   │ Email:    ${adminData.email.padEnd(30)}│`);
    console.log(`   │ Password: ${adminData.password.padEnd(30)}│`);
    console.log('   └─────────────────────────────────────────────┘');
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');
    console.log('\n🌐 Access Points:');
    console.log('   • Frontend: http://localhost:5173/login');
    console.log('   • API Docs: http://localhost:5000/api-docs');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    logger.error('Failed to create admin user:', error);
    console.error('\n❌ Error creating admin user:', error.message);
    process.exit(1);
  }
}

// Run the script
createAdmin();

