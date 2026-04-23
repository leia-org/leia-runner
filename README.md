# LEIA Customer API

API for interacting with LEIA instances.

## Requirements

- Node.js 16+
- PNPM
- Redis

## Usage

### Environment variables

Use `.env.example` as reference. For conversation cache behavior in Redis, you can control it with one switch:

- Global: `CONVERSATION_CACHE_ENABLED=true|false`
- TTL de conversaciones: `CONVERSATION_HISTORY_TTL=2629800` (seconds; default 2629800 = 1 month)
- Provider overrides:
  - `OPENAI_CONVERSATION_CACHE_ENABLED=true|false`
  - `GEMINI_CONVERSATION_CACHE_ENABLED=true|false`
  - `OLLAMA_CONVERSATION_CACHE_ENABLED=true|false`

Priority order:

1. Provider-specific variable
2. Global variable
3. Default value (`true`)

### Start the server

```bash
npm start
```

### Start the server in development mode

```bash
npm dev
```

## API

The API provides the following endpoints:

### Create a LEIA instance

```
POST /api/v1/leias
```

**Headers:**

```
Authorization: Bearer YOUR_RUNNER_KEY
```

**Body:**

```json
{
  "sessionId": "unique-session-id",
  "leia": {
    "spec": {
      "persona": { ... },
      "behaviour": { ... },
      "problem": { ... }
    }
  },
  "runnerConfiguration": {
    "provider": "openai"
  }
}
```

**Responses:**

- `201 Created`: LEIA created successfully
- `400 Bad Request`: Required parameters missing
- `401 Unauthorized`: Invalid authentication token
- `409 Conflict`: Session with the same ID already exists
- `500 Internal Server Error`: Internal server error

### Send message to a LEIA instance

```
POST /api/v1/leias/:sessionId/messages
```

**Headers:**

```
Authorization: Bearer YOUR_RUNNER_KEY
```

**Body:**

```json
{
  "message": "Your message for LEIA"
}
```

**Responses:**

- `200 OK`: Message processed successfully
- `400 Bad Request`: Required parameters missing
- `401 Unauthorized`: Invalid authentication token
- `404 Not Found`: Session with the provided ID not found
- `500 Internal Server Error`: Internal server error

### List available models

```
GET /api/v1/models
```

**Headers:**

```
Authorization: Bearer YOUR_RUNNER_KEY
```

**Response:**

```json
{
  "models": ["openai", "openai-responses", "openai-advanced"],
  "default": "openai-advanced"
}
```

**Responses:**

- `200 OK`: List of models retrieved successfully
- `401 Unauthorized`: Invalid authentication token
- `500 Internal Server Error`: Internal server error

## Documentation

API documentation is available at:

```
http://localhost:5000/docs
```
