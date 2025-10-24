require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');

// We REMOVE axios, as we are no longer calling the AI service directly

// --- NEW: Import Redis and Kafka ---
const { createClient } = require('redis');
const { Kafka } = require('kafkajs');

const app = express();
const port = process.env.PORT || 3001;

// --- NEW: Kafka Client Setup ---
const kafka = new Kafka({
  clientId: 'artify-app',
  brokers: ['localhost:9092'] // Connect to our local Kafka
});
const producer = kafka.producer();

// --- NEW: Redis Client Setup ---
const redisClient = createClient({
  url: 'redis://localhost:6379' // Connect to our local Redis
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));

// --- DB Pool (Unchanged) ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: 'localhost', 
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// --- NEW: Main Connection Function ---
const connectServices = async () => {
  try {
    // Connect to all 3 services on startup
    await redisClient.connect();
    console.log('Redis connected successfully.');
    await producer.connect();
    console.log('Kafka Producer connected successfully.');
    const dbClient = await pool.connect();
    console.log('Database connected successfully.');
    dbClient.release();
  } catch (err) {
    console.error('Failed to connect to one or more services:', err);
    process.exit(1); // Exit if we can't connect
  }
};

// Middleware
app.use(cors());
app.use(express.json()); // Use JSON for all routes

// --- 1. AUTH ROUTES ---

// @route   POST api/artists/register
// @desc    Register a new artist
app.post('/api/artists/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    let artist = await pool.query('SELECT * FROM artists WHERE email = $1', [email]);
    if (artist.rows.length > 0) {
      return res.status(400).json({ msg: 'Artist already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newArtist = await pool.query(
      'INSERT INTO artists (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, password_hash]
    );
    const payload = { artist: { id: newArtist.rows[0].id } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: 3600 }, 
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
    let artist = await pool.query('SELECT * FROM artists WHERE email = $1', [email]);
    if (artist.rows.length === 0) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    const artistData = artist.rows[0];
    const isMatch = await bcrypt.compare(password, artistData.password_hash);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    const payload = { artist: { id: artistData.id } };
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


// --- 2. PROTECTED PRODUCT ROUTES (MODIFIED) ---

// @route   GET api/artists/my-products
// @desc    Get all products for the logged-in artist (NOW CACHED)
app.get('/api/artists/my-products', authMiddleware, async (req, res) => {
  const artistId = req.artist.id;
  const cacheKey = `products:artist:${artistId}`;
  
  try {
    // 1. Try to get from Cache
    const cachedProducts = await redisClient.get(cacheKey);
    if (cachedProducts) {
      // If found, return cached data
      return res.json(JSON.parse(cachedProducts));
    }

    // 2. If not in cache, get from DB
    const products = await pool.query(
      'SELECT * FROM products WHERE artist_id = $1 ORDER BY created_at DESC',
      [artistId]
    );
    
    // 3. Save to Cache (with 10-minute expiration) and return
    await redisClient.setEx(cacheKey, 600, JSON.stringify(products.rows));
    res.json(products.rows);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/products
// @desc    Create a new product (NOW ASYNCHRONOUS)
app.post('/api/products', authMiddleware, async (req, res) => {
  const { name, description, price, image_url } = req.body;
  const artistId = req.artist.id;
  
  try {
    // Step 1: Save product to DB. Note we are NOT saving tags anymore.
    const newProduct = await pool.query(
      'INSERT INTO products (artist_id, name, description, price, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [artistId, name, description, price, image_url]
    );
    const productData = newProduct.rows[0];

    // --- NEW: Step 2: Publish an event to Kafka ---
    // We no longer call the AI service directly.
    await producer.send({
      topic: 'product-created',
      messages: [
        { value: JSON.stringify(productData) }
      ],
    });

    // --- NEW: Step 3: Invalidate (delete) caches ---
    await redisClient.del(`products:artist:${artistId}`);
    await redisClient.del('products:all');

    // Step 4: Respond to user immediately
    // 202 "Accepted" means "we've accepted your request, and it's being processed."
    res.status(202).json(productData);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/products/:id
// @desc    Update a product (NOW INVALIDATES CACHE)
app.put('/api/products/:id', authMiddleware, async (req, res) => {
  const { name, description, price, image_url } = req.body;
  const productId = req.params.id;
  const artistId = req.artist.id;

  try {
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) return res.status(404).json({ msg: 'Product not found' });
    if (product.rows[0].artist_id !== artistId) return res.status(401).json({ msg: 'Not authorized' });

    const originalProduct = product.rows[0];
    const updatedName = name ?? originalProduct.name;
    const updatedDescription = description ?? originalProduct.description;
    const updatedPrice = price ?? originalProduct.price;
    const updatedImageUrl = image_url ?? originalProduct.image_url;

    const updatedProduct = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, image_url = $4 WHERE id = $5 RETURNING *',
      [updatedName, updatedDescription, updatedPrice, updatedImageUrl, productId]
    );

    // --- NEW: Invalidate caches ---
    await redisClient.del(`products:artist:${artistId}`);
    await redisClient.del('products:all');
    
    res.json(updatedProduct.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/products/:id
// @desc    Delete a product (NOW INVALIDATES CACHE)
app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  const productId = req.params.id;
  const artistId = req.artist.id;

  try {
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) return res.status(404).json({ msg: 'Product not found' });
    if (product.rows[0].artist_id !== artistId) return res.status(401).json({ msg: 'Not authorized' });
    
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);

    // --- NEW: Invalidate caches ---
    await redisClient.del(`products:artist:${artistId}`);
    await redisClient.del('products:all');

    res.json({ msg: 'Product removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// --- 3. PUBLIC ROUTES (MODIFIED) ---

// @route   GET /api/products
// @desc    Get all products (NOW CACHED)
app.get('/api/products', async (req, res) => {
  const cacheKey = 'products:all';
  try {
    // 1. Try Cache
    const cachedProducts = await redisClient.get(cacheKey);
    if (cachedProducts) {
      // If found, return it
      return res.json(JSON.parse(cachedProducts));
    }

    // 2. Get from DB
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');

    // 3. Save to Cache and return
    await redisClient.setEx(cacheKey, 600, JSON.stringify(result.rows)); // Cache for 10 mins
    res.json(result.rows);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- NEW: Start server after connecting to services ---
app.listen(port, async () => {
  await connectServices();
  console.log(`Backend server running on http://localhost:${port}`);
});

