/**
 * Wizard routes for LEIA creation with AI assistance
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { bearerAuth } = require('../utils/auth');
const { getRedisClient } = require('../config/redis');
const { createWizardConversation, processWizardStep, continueWizardConversation } = require('../services/wizardAgent');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /wizard/sessions
 * Create a new wizard session
 */
router.post('/sessions', bearerAuth, async (req, res) => {
  try {
    const { userPrompt } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string') {
      return res.status(400).json({
        error: 'userPrompt is required and must be a string'
      });
    }

    // Create new session ID
    const sessionId = uuidv4();

    // Initialize conversation
    const conversation = await createWizardConversation(userPrompt);

    // Store in Redis
    const redis = getRedisClient();
    await redis.setex(
      `wizard:${sessionId}`,
      3600, // 1 hour expiry
      JSON.stringify(conversation)
    );

    res.json({
      sessionId,
      message: 'Wizard session created'
    });

  } catch (error) {
    logger.error('Error creating wizard session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /wizard/sessions/:sessionId/stream
 * SSE endpoint for streaming wizard progress
 */
router.get('/sessions/:sessionId/stream', bearerAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Load conversation from Redis
    const redis = getRedisClient();
    const conversationData = await redis.get(`wizard:${sessionId}`);

    if (!conversationData) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session not found' })}\n\n`);
      res.end();
      return;
    }

    const conversation = JSON.parse(conversationData);

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Process wizard step and stream updates
    const generator = processWizardStep(conversation);

    for await (const update of generator) {
      // Send update to client
      res.write(`data: ${JSON.stringify(update)}\n\n`);

      // If error or complete, end stream
      if (update.type === 'error' || update.type === 'complete') {
        break;
      }
    }

    // Save updated conversation to Redis
    await redis.setex(
      `wizard:${sessionId}`,
      3600,
      JSON.stringify(conversation)
    );

    // End stream
    res.write(`data: ${JSON.stringify({ type: 'stream_end' })}\n\n`);
    res.end();

  } catch (error) {
    logger.error('Error in wizard stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

/**
 * POST /wizard/sessions/:sessionId/message
 * Send a message to continue wizard conversation (refinement/feedback)
 */
router.post('/sessions/:sessionId/message', bearerAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;

  try {
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'message is required and must be a string'
      });
    }

    // Load conversation from Redis
    const redis = getRedisClient();
    const conversationData = await redis.get(`wizard:${sessionId}`);

    if (!conversationData) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const conversation = JSON.parse(conversationData);

    // Add user message to conversation
    conversation.messages.push({ role: 'user', content: message });

    // Save updated conversation
    await redis.setex(
      `wizard:${sessionId}`,
      3600,
      JSON.stringify(conversation)
    );

    res.json({
      success: true,
      message: 'Message added to conversation'
    });

  } catch (error) {
    logger.error('Error adding message to wizard:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /wizard/sessions/:sessionId
 * Get current wizard session state
 */
router.get('/sessions/:sessionId', bearerAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const redis = getRedisClient();
    const conversationData = await redis.get(`wizard:${sessionId}`);

    if (!conversationData) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const conversation = JSON.parse(conversationData);

    res.json({
      sessionId,
      completed: conversation.completed,
      persona: conversation.persona,
      problem: conversation.problem,
      behaviour: conversation.behaviour
    });

  } catch (error) {
    logger.error('Error getting wizard session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /wizard/sessions/:sessionId
 * Delete a wizard session
 */
router.delete('/sessions/:sessionId', bearerAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const redis = getRedisClient();
    await redis.del(`wizard:${sessionId}`);

    res.json({
      success: true,
      message: 'Session deleted'
    });

  } catch (error) {
    logger.error('Error deleting wizard session:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
