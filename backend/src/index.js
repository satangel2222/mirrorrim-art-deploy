require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const fal = require('@fal-ai/client');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Backend running', timestamp: new Date() });
});

// Initialize FAL AI client
fal.config({
  credentials: process.env.FAL_KEY,
});

// Generate image endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, userId, loraIds = [], numInferenceSteps = 25 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Call FAL AI Z-Image Turbo API
    const result = await fal.subscribe('fal-ai/z-image/turbo/lora', {
      input: {
        prompt: prompt,
        loras: loraIds.length > 0 ? loraIds : undefined,
        num_inference_steps: numInferenceSteps,
        image_size: 'landscape_16_9',
        guidance_scale: 7.5,
      },
    });

    // Save generation to database
    if (userId) {
      await pool.query(
        `INSERT INTO generations (user_id, prompt, image_url, fal_request_id, credits_used, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, prompt, result.images[0]?.url, result.request_id, 0.25, 'completed']
      );

      // Deduct credits
      await pool.query(
        `UPDATE users SET credits = credits - $1 WHERE id = $2`,
        [0.25, userId]
      );
    }

    res.json({
      success: true,
      image: result.images[0]?.url,
      seed: result.seed,
      model: 'z-image-turbo-6b',
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Image generation failed', message: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log('Connected to database:', process.env.DATABASE_URL ? 'Yes' : 'No');
});
