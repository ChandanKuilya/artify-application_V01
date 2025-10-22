require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // added axios for calling ai services for /api/products
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware'); // <-- IMPORT OUR MIDDLEWARE

const app = express();
const port = process.env.PORT || 3001;

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// DB Connection Check
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Error executing query', err.stack);
    }
    console.log('Database connected successfully:', result.rows[0].now);
  });
});

// Middleware
app.use(cors());
app.use(express.json());

// --- 1. AUTH ROUTES ---

// @route   POST api/artists/register
// @desc    Register a new artist
app.post('/api/artists/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // 1. Check if artist already exists
    let artist = await pool.query('SELECT * FROM artists WHERE email = $1', [email]);
    if (artist.rows.length > 0) {
      return res.status(400).json({ msg: 'Artist already exists' });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 3. Save new artist to database
    const newArtist = await pool.query(
      'INSERT INTO artists (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, password_hash]
    );

    // 4. Create and return JWT
    const payload = {
      artist: {
        id: newArtist.rows[0].id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: 3600 }, // Expires in 1 hour
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Authenticate artist & get token
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Check if artist exists
    let artist = await pool.query('SELECT * FROM artists WHERE email = $1', [email]);
    if (artist.rows.length === 0) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const artistData = artist.rows[0];

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, artistData.password_hash);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    // 3. Create and return JWT
    const payload = {
      artist: {
        id: artistData.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// --- 2. PROTECTED PRODUCT ROUTES (CRUD) ---


// @route   GET api/artists/my-products
    // @desc    Get all products for the logged-in artist
    // @access  Private
app.get('/api/artists/my-products', authMiddleware, async (req, res) => {
      try {
        const products = await pool.query(
          'SELECT * FROM products WHERE artist_id = $1 ORDER BY created_at DESC',
          [req.artist.id]
        );
        res.json(products.rows);
      } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
      }
 });

    // @route   POST api/products
    // @desc    Create a new product
    // ... (rest of the file)


// @route   POST api/products
// @desc    Create a new product
// @access  Private
app.post('/api/products', authMiddleware, async (req, res) => {
  const { name, description, price, image_url } = req.body;
  const artistId = req.artist.id;
  let tags = []; // Default to an empty array

  try {
    // --- START OF NEW LOGIC ---
    // Step 1: Call the AI service to generate tags
    try {
      const aiServiceResponse = await axios.post('http://localhost:8000/generate-tags/', {
        name,
        description,
      });
      tags = aiServiceResponse.data.tags || [];
    } catch (aiError) {
      // If the AI service fails, we don't want the whole request to fail.
      // We'll just log the error and continue without tags.
      // In a production app, you might add this to a retry queue.
      console.error("AI Service Error:", aiError.message);
    }
    // --- END OF NEW LOGIC ---

    // Step 2: Save the new product with its tags to the database
    const newProduct = await pool.query(
      // Note the new 'tags' column and the new '$6' parameter
      'INSERT INTO products (artist_id, name, description, price, image_url, tags) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [artistId, name, description, price, image_url, tags]
    );

    res.status(201).json(newProduct.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});



// @route   PUT api/products/:id
// @desc    Update a product
// @access  Private
app.put('/api/products/:id', authMiddleware, async (req, res) => {
  const { name, description, price, image_url } = req.body;
  const productId = req.params.id;
  const artistId = req.artist.id;

  try {
    // 1. Verify artist owns this product
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    if (product.rows[0].artist_id !== artistId) {
      return res.status(401).json({ msg: 'Not authorized to edit this product' });
    }

    // 2. Update the product
    const updatedProduct = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, image_url = $4 WHERE id = $5 RETURNING *',
      [name, description, price, image_url, productId]
    );

    res.json(updatedProduct.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/products/:id
// @desc    Delete a product
// @access  Private
app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  const productId = req.params.id;
  const artistId = req.artist.id;

  try {
    // 1. Verify artist owns this product
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    if (product.rows[0].artist_id !== artistId) {
      return res.status(401).json({ msg: 'Not authorized to delete this product' });
    }

    // 2. Delete the product
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);

    res.json({ msg: 'Product removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// --- 3. PUBLIC ROUTES (from Sprint 1) ---

// @route   GET /api/products
// @desc    Get all products
// @access  Public
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});