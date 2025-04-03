const { createClient } = require('redis');
require('dotenv').config();

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.log('Redis Client Error', err);
});

async function initRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('Redis client connected');
  }
  return redisClient;
}

module.exports = {
  initRedis,
  redisClient
}; 