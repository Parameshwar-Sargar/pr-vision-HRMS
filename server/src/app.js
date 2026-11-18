import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env.js';
import { getDatabaseStatus, isDatabaseReady } from './config/db.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import { createCompressionMiddleware } from './middleware/compressionMiddleware.js';
import { sanitizeRequestInputs } from './utils/securityUtils.js';

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
app.use(sanitizeRequestInputs);

// Server-side execution timing header (X-Response-Time)
app.use((req, res, next) => {
  const startAt = process.hrtime.bigint();
  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1e6;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    }
    return originalWriteHead.apply(this, args);
  };
  next();
});

// Safe gzip response compression for compressible API JSON/text/CSV payloads (>= 1 KB)
app.use(createCompressionMiddleware({ threshold: 1024 }));

// Logger (Skip in test suite)
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Disable unauthenticated or direct public file access under /uploads
app.use('/uploads', (req, res) => {
  const hasBearer =
    typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ');
  return res.status(hasBearer ? 403 : 401).json({
    success: false,
    message: hasBearer
      ? 'Access denied: Direct access to /uploads is disabled. Use authenticated API download endpoints.'
      : 'Authentication required. Direct public access to private uploads is forbidden.',
    errors: [],
  });
});

// Health Check Handlers (Liveness & Readiness)
const healthCheckHandler = (req, res) => {
  const dbStatus = getDatabaseStatus();
  const isReady = dbStatus.ready;
  const uptimeSeconds = Math.floor(process.uptime());

  res.status(isReady ? 200 : 503).json({
    success: isReady,
    status: isReady ? 'healthy' : 'degraded',
    live: true,
    ready: isReady,
    server: 'running',
    environment: env.NODE_ENV,
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    database: isReady ? 'connected' : dbStatus.state,
    databaseName: dbStatus.databaseName,
    databaseState: {
      ready: dbStatus.ready,
      state: dbStatus.state,
      readyState: dbStatus.readyState,
      initialConnectDurationMs: dbStatus.initialConnectDurationMs,
      lastConnectedAt: dbStatus.lastConnectedAt,
      lastDisconnectedAt: dbStatus.lastDisconnectedAt,
      reconnectAttempts: dbStatus.reconnectAttempts,
      syncIndexesEnabled: dbStatus.syncIndexesEnabled,
    },
  });
};

app.get('/api/health', healthCheckHandler);
app.get('/api/v1/health', healthCheckHandler);

app.get('/api/health/live', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    live: true,
    server: 'running',
    environment: env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health/ready', (req, res) => {
  const dbStatus = getDatabaseStatus();
  res.status(dbStatus.ready ? 200 : 503).json({
    success: dbStatus.ready,
    status: dbStatus.ready ? 'ready' : 'not_ready',
    ready: dbStatus.ready,
    environment: env.NODE_ENV,
    database: dbStatus.ready ? 'connected' : dbStatus.state,
    databaseName: dbStatus.databaseName,
    timestamp: new Date().toISOString(),
  });
});

// Guard: verify database readiness for API operations
app.use('/api/v1', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!isDatabaseReady()) {
    return res.status(503).json({
      success: false,
      message:
        'Database is currently disconnected or not ready. Please verify MongoDB Atlas connectivity and Network Access whitelist.',
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

