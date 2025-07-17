const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const router = express.Router();
const User = require('../model/user');
const Chat = require('../model/chat');
const verifyToken = require('..//middleware/verifytoken');

console.log("✅ User type:", typeof User);
console.log("✅ User constructor:", User.constructor.name);
console.log("✅ User.findOne type:", typeof User.findOne);

const pendingUsers = {};

const verificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    // Add validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    let user = await User.findOne({ email: email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verificationCodeValue = verificationCode();

    // Store in memory
    pendingUsers[email] = {
      name,
      email,
      password: hashedPassword,
      code: verificationCodeValue
    };

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Verification - AskHubAi",
      text: `Your verification code is ${verificationCodeValue}. Please use this code to verify your email address.`
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailErr) {
      console.error('Email sending error:', emailErr);
      delete pendingUsers[email];
      return res.status(500).json({ message: "Failed to send verification email. Please try again later." });
    }

    res.status(201).json({ message: "Verification code sent to your email. Please verify to complete registration." });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post('/verify', async (req, res) => {
  const { email, code } = req.body;

  try {
    // Add validation
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required.' });
    }

    const pending = pendingUsers[email];
    if (!pending) {
      return res.status(400).json({ message: 'No pending registration for this email.' });
    }
    if (pending.code !== code) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Save user to DB
    const user = new User({
      name: pending.name,
      email: pending.email,
      password: pending.password,
      isVerified: true
    });
    await user.save();
    delete pendingUsers[email];
    res.status(200).json({ message: 'Email verified and account created successfully.' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Add validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(400).json({ message: 'Please verify your email first.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ token, message: 'Login successful.' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/resend', async (req, res) => {
  try {
    // 1. Get the email from the request body
    const { email } = req.body;

    // Add validation
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    // 2. Find the pending registration for this email
    const pending = pendingUsers[email];
    if (!pending) {
      // If not found, tell the user to register first
      return res.status(400).json({ message: 'No pending registration for this email.' });
    }

    // 3. Optional: Add a cooldown to prevent spamming (e.g., 2 minutes)
    if (pending.lastResend && Date.now() - pending.lastResend < 2 * 60 * 1000) {
      // If user tries to resend too soon, return an error
      return res.status(429).json({ message: 'Please wait before requesting a new code.' });
    }

    // 4. Generate a new verification code
    const newCode = verificationCode();
    pending.code = newCode; // Update the code in memory
    pending.lastResend = Date.now(); // Update the last resend time

    // 5. Prepare the email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // 6. Prepare the email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Resent Verification Code - AskHubAi",
      text: `Your new verification code is ${newCode}. Please use this code to verify your email address.`
    };

    // 7. Send the email
    await transporter.sendMail(mailOptions);
    // Success response
    res.status(200).json({ message: 'Verification code resent to your email.' });
  } catch (err) {
    // If email fails, return error
    console.error('Resend email error:', err);
    return res.status(500).json({ message: 'Failed to resend verification email.' });
  }
});

router.post('/save', verifyToken, async (req, res) => {
  const userId = req.userId;
  const { conversationId, title, messages } = req.body;
  console.log('Saving chat: userId=', userId, 'Data=', { conversationId, title, messages }); // Debug
  try {
    let chat = await Chat.findOne({ userId, conversationId });
    if (chat) {
      chat.messages.push(...messages);
      await chat.save();
      console.log('Chat updated:', chat); // Debug
      return res.status(200).json({ message: 'Chat updated' });
    } else {
      const newChat = new Chat({
        userId,
        conversationId,
        title: title || 'New Chat',
        messages,
      });
      await newChat.save();
      console.log('Chat created:', newChat); // Debug
      return res.status(201).json({ message: 'Chat created' });
    }
  } catch (err) {
    console.error('Save chat error:', err); // Debug
    return res.status(500).json({ message: 'Error saving chat' });
  }
});

router.get('/all', verifyToken, async (req, res) => {
  const userId = req.userId;
  console.log('Fetching chats for userId:', userId); // Debug
  try {
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });
    console.log('Chats found:', chats); // Debug
    res.status(200).json(chats);
  } catch (err) {
    console.error('Load chats error:', err); // Debug
    res.status(500).json({ message: 'Failed to load chats' });
  }
});

// ✅ Delete chat by conversationId
router.delete('/delete/:conversationId', verifyToken, async (req, res) => {
  const userId = req.userId;
  const { conversationId } = req.params;

  try {
    await Chat.findOneAndDelete({ userId, conversationId });
    res.status(200).json({ message: 'Chat deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Delete failed' });
  }
});



module.exports = router;