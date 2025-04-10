const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const server = http.createServer(app); // Use this to attach socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
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

// User login
app.post('/api/login', async (req, res) => {
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
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join', (username) => {
    socket.join(username);
    console.log(`${username} joined their room`);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { sender, receiver, content } = data;
      const message = new Message({ sender, receiver, content });
      await message.save();

      io.to(receiver).emit('receiveMessage', {
        _id: message._id,
        sender,
        receiver,
        content,
        timestamp: message.timestamp,
        isRead: false
      });

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

  socket.on('call-user', (data) => {
    io.to(data.to).emit('call-made', {
      offer: data.offer,
      from: data.from
    });
  });

  socket.on('make-answer', (data) => {
    io.to(data.to).emit('answer-made', {
      answer: data.answer,
      from: data.from
    });
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: data.from
    });
  });

  socket.on('reject-call', (data) => {
    io.to(data.to).emit('call-rejected', { from: data.from });
  });

  socket.on('end-call', (data) => {
    io.to(data.to).emit('call-ended', { from: data.from });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server (✅ use `server.listen`, not `app.listen`)
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://192.168.1.10:${PORT}`);
});
