const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/db');

const authRoutes      = require('./routes/auth');
const cropRoutes      = require('./routes/crops');
const orderRoutes     = require('./routes/orders');
const marketRoutes    = require('./routes/market');
const walletRoutes    = require('./routes/wallet');
const fieldRoutes     = require('./routes/fields');
const schemeRoutes    = require('./routes/schemes');
const advisoryRoutes  = require('./routes/advisory');
const analyticsRoutes = require('./routes/analytics');
const chatRoutes      = require('./routes/chat');
const userRoutes      = require('./routes/users');

const app    = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'https://farmbridge.vercel.app',
];

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

// ── MIDDLEWARE ──
app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);
app.use((req, res, next) => { req.io = io; next(); });

// ── ROUTES ──
app.use('/api/auth',      authRoutes);
app.use('/api/crops',     cropRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/market',    marketRoutes);
app.use('/api/wallet',    walletRoutes);
app.use('/api/fields',    fieldRoutes);
app.use('/api/schemes',   schemeRoutes);
app.use('/api/advisory',  advisoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat',      chatRoutes);
app.use('/api/users',     userRoutes);

app.get('/', (req, res) => res.json({
  app: '🌾 FarmBridge API',
  status: 'Live',
  version: '1.0.0',
  docs: '/api/health',
  timestamp: new Date().toISOString()
}));

app.get('/api/health', (req, res) => res.json({
  status: 'OK',
  app: 'FarmBridge API',
  version: '1.0.0',
  db: 'MongoDB Atlas Connected',
  timestamp: new Date().toISOString()
}));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server Error' });
});

// ── SOCKET.IO ──
const onlineUsers = new Map();
io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });
  socket.on('send_message', (data) => {
    const recv = onlineUsers.get(data.receiverId);
    if (recv) io.to(recv).emit('receive_message', data);
  });
  socket.on('price_update', (data) => io.emit('market_price_updated', data));
  socket.on('order_status', (data) => io.emit('order_updated', data));
  socket.on('disconnect', () => {
    onlineUsers.forEach((sid, uid) => { if (sid === socket.id) onlineUsers.delete(uid); });
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });
});

// ── START ──
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌾 FarmBridge API running on port ${PORT}`);
    console.log(`🔗 Health: /api/health`);
  });
});
