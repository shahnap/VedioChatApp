const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const server = http.createServer(app);
// Uncomment the appropriate URL based on your environment
// const FrontUrl = 'https://videochatfront-liard.vercel.app'; // Production
const FrontUrl = 'http://localhost:5173'; // Development

// Improved Socket.IO setup with better connection options
const io = socketIo(server, {
  cors: {
    origin: [FrontUrl, 'https://videochatfront-liard.vercel.app'],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Support fallback
  pingTimeout: 60000, // Longer timeout for video calls
  pingInterval: 25000 // More frequent ping to keep connection alive
});

// Middleware
app.use(cors({
  origin: [FrontUrl, 'https://videochatfront-liard.vercel.app'],
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
const MONGO_URI = 'mongodb+srv://shahnapshahna243:kuEKk6GFFC0LiBEE@chatcluster.ip9rviw.mongodb.net/?retryWrites=true&w=majority&appName=ChatCluster';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define user schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  displayName: { type: String, required: true },
  profilePic: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// Define message schema
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// JWT secret
const JWT_SECRET = 'your_jwt_secret_key';

// Socket.io connections map
const activeUsers = new Map();
// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      displayName,
      profilePic: `https://ui-avatars.com/api/?name=${displayName}&background=random`
    });
    await user.save();
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        profilePic: user.profilePic
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Add this to your main server file (e.g., main.js or index.js)

app.get('/ping', (req, res) => {
  res.status(200).send('Server is running ✅');
});

// User login
app.post('/api/login', async (req, res) => {
  console.log("login clicked");
  
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        profilePic: user.profilePic
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user messages
app.get('/api/messages/:sender/:receiver', async (req, res) => {
  try {
    const { sender, receiver } = req.params;
    const messages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender }
      ]
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Socket.io connection
// WebRTC Signaling handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // User joins their own room
  socket.on('join', (username) => {
    if (username) {
      socket.join(username);
      console.log(`${username} joined room`);
    }
  });

  // Handle call initiation
  socket.on('call-user', (data) => {
    console.log(`Call from ${data.from} to ${data.to}`);
    io.to(data.to).emit('call-made', {
      offer: data.offer,
      from: data.from
    });
  });

  // Handle call answer
  socket.on('make-answer', (data) => {
    console.log(`Answer from ${data.from} to ${data.to}`);
    io.to(data.to).emit('answer-made', {
      answer: data.answer,
      from: data.from
    });
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    console.log(`ICE candidate from ${data.from} to ${data.to}`);
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: data.from
    });
  });

  // Handle call rejection
  socket.on('reject-call', (data) => {
    console.log(`Call rejected: ${data.from} to ${data.to}`);
    io.to(data.to).emit('call-rejected', {
      from: data.from
    });
  });

  // Handle call ending
  socket.on('end-call', (data) => {
    console.log(`Call ended: ${data.from} to ${data.to}`);
    io.to(data.to).emit('call-ended', {
      from: data.from
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

// io.on('connection', (socket) => {
//   console.log('Client connected:', socket.id);

//   socket.on('join', (username) => {
//     if (username) {
//       socket.join(username);
//       activeUsers.set(socket.id, username);
//       console.log(`${username} joined their room (socket ${socket.id})`);
      
//       // Let everyone know this user is online
//       io.emit('user-online', username);
//     }
//   });

  socket.on('sendMessage', async (data) => {
    try {
      const { sender, receiver, content } = data;
      console.log(`Message from ${sender} to ${receiver}: ${content.substring(0, 20)}...`);
      
      const message = new Message({ sender, receiver, content });
      await message.save();

      // Send to receiver
      io.to(receiver).emit('receiveMessage', {
        _id: message._id,
        sender,
        receiver,
        content,
        timestamp: message.timestamp,
        isRead: false
      });

      // Confirm to sender
      socket.emit('messageSent', {
        _id: message._id,
        sender,
        receiver,
        content,
        timestamp: message.timestamp,
        isRead: false
      });
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('messageError', { message: 'Failed to send message' });
    }
  });

  socket.on('markAsRead', async ({ messageId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, { isRead: true });
      io.emit('messageRead', { messageId });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  // WebRTC Signaling
  // socket.on('call-user', (data) => {
  //   console.log(`Call from ${data.from} to ${data.to}`);
  //   io.to(data.to).emit('call-made', {
  //     offer: data.offer,
  //     from: data.from
  //   });
  // });

  // socket.on('make-answer', (data) => {
  //   console.log(`Answer from ${data.from} to ${data.to}`);
  //   io.to(data.to).emit('answer-made', {
  //     answer: data.answer,
  //     from: data.from
  //   });
  // });

  socket.on('ice-candidate', (data) => {
    console.log(`ICE candidate from ${data.from} to ${data.to}`);
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: data.from
    });
  });

  // socket.on('reject-call', (data) => {
  //   console.log(`Call rejected: ${data.from} to ${data.to}`);
  //   io.to(data.to).emit('call-rejected', { 
  //     from: data.from,
  //     reason: data.reason || 'Call rejected by user'
  //   });
  // });

  // socket.on('end-call', (data) => {
  //   console.log(`Call ended: ${data.from} to ${data.to}`);
  //   io.to(data.to).emit('call-ended', { 
  //     from: data.from 
  //   });
  // });

  // socket.on('disconnect', () => {
  //   const username = activeUsers.get(socket.id);
  //   console.log(`Client disconnected: ${socket.id}${username ? ` (${username})` : ''}`);
    
  //   if (username) {
  //     activeUsers.delete(socket.id);
  //     // Let everyone know this user is offline
  //     io.emit('user-offline', username);
  //   }
  // });
});

// Add a simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});