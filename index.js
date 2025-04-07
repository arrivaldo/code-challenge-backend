import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { db } from "./db.js";
import bcrypt from "bcryptjs";
import { v2 as cloudinary } from 'cloudinary';
import { uploadSingle } from './middleware/multer.js';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const app = express();
const saltRounds = 10;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Helper function to generate GUID
function generateGUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Image Upload Endpoint
app.post('/api/upload', uploadSingle('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'No file uploaded' 
      });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          folder: 'user-profiles',
          resource_type: 'auto',
          allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
          transformation: [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          resolve(result);
        }
      );
      
      uploadStream.end(req.file.buffer);
    });

    res.json({ 
      success: true,
      url: result.secure_url,
      public_id: result.public_id
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// Register Route
app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      company,
      email,
      password,
      phone,
      address,
      age,
      eyeColor,
      balance,
      picture
    } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    await db.read();

    // Check if user exists
    const existingUser = db.data.users.find(user => user.email === email);
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "User already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user object
    const newUser = {
      _id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      guid: generateGUID(),
      isActive: true,
      balance: balance || "$1,000.00",
      picture: picture || "http://placehold.it/32x32",
      picturePublicId: null,
      age: age || 25,
      eyeColor: eyeColor || "brown",
      name: {
        first: name?.first || (typeof name === 'string' ? name.split(' ')[0] : "User"),
        last: name?.last || (typeof name === 'string' ? name.split(' ')[1] : "Anonymous")
      },
      company: company || "Freelance",
      email,
      password: hashedPassword,
      phone: phone || "+1 (000) 000-0000",
      address: address || "123 Main Street, Anytown, USA",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to database
    db.data.users.push(newUser);
    await db.write();

    // Return response without sensitive data
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ 
      success: true, 
      message: "User registered successfully",
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Registration failed",
      error: error.message
    });
  }
});

// Unified Login Route (handles both regular users and admins)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    await db.read();

    // First check if it's an admin
    const admin = db.data.admins?.find(admin => admin.email === email);
    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        const { password: _, ...adminWithoutPassword } = admin;
        return res.json({ 
          success: true, 
          message: "Admin login successful",
          user: adminWithoutPassword,
          isAdmin: true
        });
      }
    }

    // If not admin, check regular users
    const user = db.data.users.find(user => user.email === email);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      success: true, 
      message: "Login successful",
      user: userWithoutPassword,
      isAdmin: false
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Login failed",
      error: error.message
    });
  }
});

// Profile Route
app.get("/api/auth/profile", async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email parameter is required" 
      });
    }

    await db.read();
    const user = db.data.users.find(user => user.email === email);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      success: true, 
      user: userWithoutPassword 
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch profile",
      error: error.message
    });
  }
});

// Update Profile Route
app.put("/api/auth/profile", async (req, res) => {
  try {
    const { email, updates } = req.body;
    
    if (!email || !updates) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and updates are required" 
      });
    }

    await db.read();
    const userIndex = db.data.users.findIndex(user => user.email === email);
    
    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Update user data
    db.data.users[userIndex] = {
      ...db.data.users[userIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await db.write();

    const { password: _, ...updatedUser } = db.data.users[userIndex];
    res.json({ 
      success: true, 
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update profile",
      error: error.message
    });
  }
});

// Admin Routes

// Get All Users (Admin Only)
app.get("/api/admin/users", async (req, res) => {
  try {
    // In a real app, verify admin credentials from headers or tokens
    await db.read();
    
    // Return users without passwords
    const users = db.data.users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    res.json({ 
      success: true, 
      users 
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to get users",
      error: error.message
    });
  }
});

// Update User Status (Admin Only)
app.put("/api/admin/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    await db.read();
    const userIndex = db.data.users.findIndex(user => user._id === id);
    
    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    db.data.users[userIndex].isActive = isActive;
    db.data.users[userIndex].updatedAt = new Date().toISOString();
    await db.write();

    const { password, ...updatedUser } = db.data.users[userIndex];
    res.json({ 
      success: true, 
      message: "User status updated",
      user: updatedUser
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update user status",
      error: error.message
    });
  }
});

// Delete User (Admin Only)
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.read();
    const userIndex = db.data.users.findIndex(user => user._id === id);
    
    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Delete user's picture from Cloudinary if exists
    if (db.data.users[userIndex].picturePublicId) {
      await cloudinary.uploader.destroy(db.data.users[userIndex].picturePublicId)
        .catch(err => console.error('Cloudinary delete error:', err));
    }

    db.data.users.splice(userIndex, 1);
    await db.write();

    res.json({ 
      success: true, 
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete user",
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    error: err.message
  });
});

app.get('/api/generate-hash', async (req, res) => {
  const password = "admin123"; // Your admin password
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  res.json({ hashedPassword });
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Cloudinary config:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'not set',
    api_secret: process.env.CLOUDINARY_API_SECRET ? '***' + process.env.CLOUDINARY_API_SECRET.slice(-4) : 'not set'
  });
});