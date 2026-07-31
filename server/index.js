const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const socketHandlers = require('./sockets/socketHandlers');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // replace with frontend domain in production
    methods: ['GET', 'POST'],
  },
  // Mobile browsers throttle JS timers heavily when backgrounded/screen-locked,
  // so heartbeats can lag well past the socket.io defaults (20s timeout) on a
  // perfectly fine connection. Give it more slack before declaring a client dead.
  pingInterval: 25000,
  pingTimeout: 60000,
  // Lets a client that reconnects within the window resume its previous
  // session (same socket id, rooms rejoined, missed broadcasts replayed)
  // instead of surfacing a hard disconnect for brief network blips.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});

// 托管前端构建产物（前端 build 在项目根目录的 build/ 下）
app.use(express.static(path.join(__dirname, '../build')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);
  socketHandlers(io, socket);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
