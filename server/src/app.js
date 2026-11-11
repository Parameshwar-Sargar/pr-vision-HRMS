import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorMiddleware.js';

const app = express();

// Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS Configuration
const allowedOrigins = [env.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman) or matched origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy: Not allowed by origin'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-target-tenant',
      'X-Tab-Id',
      'X-Session-Id',
    ],
  })
);

// Rate Limiter
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    errors: [],
  },
});
app.use('/api', limiter);

// Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(env.COOKIE_SECRET));

// Logger (Skip in test suite)
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve('uploads')));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const dbName = mongoose.connection.name || 'pr_vision_hrms';
  const uptimeSeconds = Math.floor(process.uptime());
  res.status(isDbConnected ? 200 : 503).json({
    success: isDbConnected,
    server: 'running',
    database: isDbConnected ? 'connected' : 'disconnected',
    databaseName: dbName,
    uptime: uptimeSeconds,
  });
});

// Guard: verify database connectivity for API operations
app.use('/api/v1', (req, res, next) => {
  if (req.path === '/health') return next();
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database is currently disconnected. Please verify your MongoDB Atlas IP whitelist (Network Access: add current IP or 0.0.0.0/0).',
      errors: ['Database unavailable'],
    });
  }
  next();
});

// Mount API v1 Routes
app.use('/api/v1', routes);

// 404 Route Catch-All
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found at endpoint [${req.method} ${req.originalUrl}]`,
    errors: ['Endpoint not found'],
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;

