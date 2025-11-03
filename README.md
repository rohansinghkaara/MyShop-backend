# MyShop E-commerce Backend

A RESTful API backend for the MyShop e-commerce website built with Node.js, Express, and SQLite.

## Features

- User authentication and authorization with JWT
- Product management with filtering, sorting, and pagination
- Shopping cart functionality
- Order processing and management
- Security features (XSS protection, rate limiting, helmet, CSRF, etc.)
- Comprehensive logging with Winston
- API documentation with Swagger
- Unit and integration tests with Jest

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation (Windows)

1. **Navigate to backend directory:**
   ```cmd
   cd MyShop-backend
   ```

2. **Install dependencies:**
   ```cmd
   npm install
   ```

3. **Configure environment variables:**
   
   Copy `.env.example` to `.env`:
   ```cmd
   copy .env.example .env
   ```
   
   Then edit `.env` and update the following minimum required variables:
   ```env
   PORT=5000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   JWT_SECRET=change-this-to-a-strong-secret-min-32-characters
   SESSION_SECRET=change-this-to-a-strong-session-secret
   ```

4. **Create required directories:**
   ```cmd
   mkdir database
   mkdir logs
   mkdir uploads
   ```

### Running the Server

**Development mode (with auto-reload):**
```cmd
npm run dev
```

**Production mode:**
```cmd
npm start
```

**Expected output:**
```
Server running on port 5000
API available at http://localhost:5000
SQLite database connection established successfully
Database synchronized successfully
```

## API Endpoints

### Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/me` - Get current user profile (protected)

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create new product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Shopping Cart
- `GET /api/cart` - Get user's cart (protected)
- `POST /api/cart` - Add item to cart (protected)
- `PUT /api/cart/:itemId` - Update cart item (protected)
- `DELETE /api/cart/:itemId` - Remove item from cart (protected)
- `DELETE /api/cart` - Clear cart (protected)

### Orders
- `GET /api/orders` - Get user's orders (protected)
- `GET /api/orders/:id` - Get single order (protected)
- `POST /api/orders` - Create new order (protected)
- `PUT /api/orders/:id` - Update order status (admin only)

## Testing

Run all tests:
```cmd
npm test
```

Run tests with coverage:
```cmd
npm run test:coverage
```

Run tests in watch mode (for development):
```cmd
npm run test:watch
```

## API Documentation

When the server is running, access the interactive API documentation at:
```
http://localhost:5000/api-docs
```

## Security

This API implements several security measures:
- JWT authentication
- Password hashing with bcrypt (10 rounds)
- XSS protection with xss-clean
- Rate limiting to prevent abuse
- HTTP parameter pollution prevention
- Security headers with Helmet
- CSRF protection
- Input validation with Joi and Express-Validator
- Secure session management
- Environment-based secrets

## Troubleshooting (Windows)

### Port Already in Use

If you get "Port 5000 already in use" error:

```cmd
REM Find the process using port 5000
netstat -ano | findstr :5000

REM Kill the process (replace <PID> with actual Process ID)
taskkill /PID <PID> /F
```

### Database Connection Errors

Reset the database (WARNING: This deletes all data):
```cmd
rd /s /q database
mkdir database
```

Then restart the server to recreate the database.

### Module Not Found Errors

Clean install dependencies:
```cmd
rd /s /q node_modules
del package-lock.json
npm cache clean --force
npm install
```

### Permission Errors

Run Command Prompt as Administrator:
1. Search for "cmd" in Windows
2. Right-click "Command Prompt"
3. Select "Run as administrator"

## Project Structure

```
MyShop-backend/
├── config/              # Configuration files
│   ├── database.js     # Sequelize configuration
│   └── redis.js        # Redis configuration
├── controllers/         # Request handlers
├── middleware/          # Custom middleware
├── models/             # Sequelize models
├── routes/             # Express routes
├── services/           # Business logic
├── repositories/       # Data access layer
├── tests/              # Test files
├── utils/              # Utility functions
├── logs/               # Log files (auto-generated)
├── uploads/            # Uploaded files (auto-generated)
├── database/           # SQLite database (auto-generated)
├── server.js           # Main application file
└── package.json        # Dependencies and scripts
```

## Environment Variables Reference

See `.env.example` for all available configuration options.

**Required Variables:**
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `JWT_SECRET` - Secret for JWT tokens (min 32 characters)
- `SESSION_SECRET` - Secret for sessions (min 32 characters)
- `CORS_ORIGIN` - Allowed origin for CORS (frontend URL)

**Optional Variables:**
- Redis, Email, SMS, Payment gateway configurations
- See `.env.example` for complete list

## Logging

Logs are stored in `logs/app.log` and also displayed in the console.

Log levels: `error`, `warn`, `info`, `http`, `debug`

To change log level, update `LOG_LEVEL` in `.env` file.

## Contributing

1. Follow Google JavaScript Style Guide
2. Write unit tests for new features
3. Ensure all tests pass before committing
4. Add proper error handling and logging
5. Document your code with JSDoc comments

## License

MIT
- Security headers with Helmet