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
});

// 托管前端构建产物（前端 build 在项目根目录的 build/ 下）
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => {
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
