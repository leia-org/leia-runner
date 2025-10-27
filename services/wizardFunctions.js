/**
 * Function handlers for LEIA Wizard Agent
 * These functions implement the actual logic for each tool the agent can call
 */

const axios = require('axios');
const logger = require('../utils/logger');
const modelManager = require('../models/modelManager');
const OpenAI = require('openai');

// Initialize OpenAI client for structured outputs
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// JSON Schemas for Structured Outputs
// Note: Persona spec fields are all optional in the database schema
// We require the most important ones for generation
const PERSONA_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "persona",
    strict: true,
    schema: {
      type: "object",
      properties: {
        apiVersion: {
          type: "string",
          enum: ["v1"]
        },
        metadata: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: {
              type: "object",
              properties: {
                major: { type: "number" },
                minor: { type: "number" },
                patch: { type: "number" }
              },
              required: ["major", "minor", "patch"],
              additionalProperties: false
            }
          },
          required: ["name", "version"],
          additionalProperties: false
        },
        spec: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            firstName: { type: "string" },
            description: { type: "string" },
            personality: { type: "string" },
            subjectPronoum: { type: "string" },
            objectPronoum: { type: "string" },
            possesivePronoum: { type: "string" },
            possesiveAdjective: { type: "string" }
          },
          required: ["fullName", "firstName", "description", "personality", "subjectPronoum", "objectPronoum", "possesivePronoum", "possesiveAdjective"],
          additionalProperties: false
        }
      },
      required: ["apiVersion", "metadata", "spec"],
      additionalProperties: false
    }
  }
};

// Note: Problem spec fields are all optional in the database schema
// solutionFormat enum: text, mermaid, yaml, markdown, html, json, xml
// process enum: requirements-elicitation, game
const PROBLEM_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "problem",
    strict: true,
    schema: {
      type: "object",
      properties: {
        apiVersion: {
          type: "string",
          enum: ["v1"]
        },
        metadata: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: {
              type: "object",
              properties: {
                major: { type: "number" },
                minor: { type: "number" },
                patch: { type: "number" }
              },
              required: ["major", "minor", "patch"],
              additionalProperties: false
            }
          },
          required: ["name", "version"],
          additionalProperties: false
        },
        spec: {
          type: "object",
          properties: {
            description: { type: "string" },
            personaBackground: { type: "string" },
            details: { type: "string" },
            solution: { type: "string" },
            solutionFormat: {
              type: "string",
              enum: ["text", "mermaid", "yaml", "markdown", "html", "json", "xml"]
            },
            process: {
              type: "array",
              items: {
                type: "string",
                enum: ["requirements-elicitation", "game"]
              }
            }
          },
          required: ["description", "personaBackground", "details", "solution", "solutionFormat", "process"],
          additionalProperties: false
        }
      },
      required: ["apiVersion", "metadata", "spec"],
      additionalProperties: false
    }
  }
};

// Note: Behaviour spec fields are all optional in the database schema
// process enum: requirements-elicitation, game
const BEHAVIOUR_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "behaviour",
    strict: true,
    schema: {
      type: "object",
      properties: {
        apiVersion: {
          type: "string",
          enum: ["v1"]
        },
        metadata: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: {
              type: "object",
              properties: {
                major: { type: "number" },
                minor: { type: "number" },
                patch: { type: "number" }
              },
              required: ["major", "minor", "patch"],
              additionalProperties: false
            }
          },
          required: ["name", "version"],
          additionalProperties: false
        },
        spec: {
          type: "object",
          properties: {
            description: { type: "string" },
            role: { type: "string" },
            process: {
              type: "array",
              items: {
                type: "string",
                enum: ["requirements-elicitation", "game"]
              }
            }
          },
          required: ["description", "role", "process"],
          additionalProperties: false
        }
      },
      required: ["apiVersion", "metadata", "spec"],
      additionalProperties: false
    }
  }
};

// Configure axios instance for Designer Backend catalog API
const catalogAPI = axios.create({
  baseURL: process.env.DESIGNER_BACKEND_URL,
  headers: {
    'x-catalog-api-key': process.env.CATALOG_API_KEY
  }
});

// Configure axios instance for authenticated wizard searches (includes user's private resources)
const wizardAPI = axios.create({
  baseURL: process.env.DESIGNER_BACKEND_URL
});

/**
 * Utility function to extract JSON from markdown code blocks
 * Handles responses like: ```json\n{...}\n```
 */
function extractJSON(text) {
  // Try to extract JSON from markdown code block
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    return JSON.parse(jsonBlockMatch[1].trim());
  }

  // If no code block, try to parse directly
  return JSON.parse(text.trim());
}

/**
 * Search for existing personas in the Designer catalog
 * If userToken is provided, searches both public and user's private personas
 */
async function searchExistingPersonas({ topic, search, limit = 5 }, userToken = null) {
  try {
    const params = {};
    if (topic) params.topic = topic;
    if (search) params.search = search;
    if (limit) params.limit = limit;

    let response;
    if (userToken) {
      // Use wizard search endpoint (includes user's private components)
      response = await wizardAPI.get('/api/v1/wizard/search/personas', {
        params,
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
    } else {
      // Use catalog endpoint (public only)
      response = await catalogAPI.get('/api/v1/catalog/personas', { params });
    }

    return {
      success: true,
      count: response.data.count,
      personas: response.data.personas.map(p => ({
        id: p._id,
        name: p.spec.name || p.spec.firstName,
        personality: p.spec.personality,
        topic: p.spec.topic,
        pronouns: p.spec.pronouns,
        emotionRange: p.spec.emotionRange
      }))
    };
  } catch (error) {
    logger.error('Error searching personas:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search for existing problems in the Designer catalog
 * If userToken is provided, searches both public and user's private problems
 */
async function searchExistingProblems({ topic, difficulty, format, search, limit = 5 }, userToken = null) {
  try {
    const params = {};
    if (topic) params.topic = topic;
    if (difficulty) params.difficulty = difficulty;
    if (format) params.format = format;
    if (search) params.search = search;
    if (limit) params.limit = limit;

    let response;
    if (userToken) {
      response = await wizardAPI.get('/api/v1/wizard/search/problems', {
        params,
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
    } else {
      response = await catalogAPI.get('/api/v1/catalog/problems', { params });
    }

    return {
      success: true,
      count: response.data.count,
      problems: response.data.problems.map(p => ({
        id: p._id,
        description: p.spec.description,
        background: p.spec.background,
        difficulty: p.spec.difficulty,
        solutionFormat: p.spec.solutionFormat,
        process: p.spec.process
      }))
    };
  } catch (error) {
    logger.error('Error searching problems:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search for existing behaviours in the Designer catalog
 * If userToken is provided, searches both public and user's private behaviours
 */
async function searchExistingBehaviours({ role, process, search, limit = 5 }, userToken = null) {
  try {
    const params = {};
    if (role) params.role = role;
    if (process) params.process = process;
    if (search) params.search = search;
    if (limit) params.limit = limit;

    let response;
    if (userToken) {
      response = await wizardAPI.get('/api/v1/wizard/search/behaviours', {
        params,
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
    } else {
      response = await catalogAPI.get('/api/v1/catalog/behaviours', { params });
    }

    return {
      success: true,
      count: response.data.count,
      behaviours: response.data.behaviours.map(b => ({
        id: b._id,
        role: b.spec.role,
        process: b.spec.process,
        description: b.spec.description,
        instructions: b.spec.instructions
      }))
    };
  } catch (error) {
    logger.error('Error searching behaviours:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Evaluate how well a component matches requirements using AI
 */
async function evaluateComponentMatch({ componentType, componentId, requirements }) {
  try {
    // Fetch the component details
    let component;
    try {
      const response = await catalogAPI.get(`/api/v1/catalog/${componentType}s/${componentId}`);
      component = response.data;
    } catch (error) {
      return {
        success: false,
        error: `Component not found: ${componentId}`
      };
    }

    // Use provider to evaluate match
    const prompt = `You are evaluating how well a LEIA ${componentType} matches user requirements.

Component Details:
${JSON.stringify(component.spec, null, 2)}

User Requirements:
${JSON.stringify(requirements, null, 2)}

Rate the match quality from 0-100 where:
- 90-100: Excellent match, meets all requirements
- 70-89: Good match, meets most requirements
- 50-69: Moderate match, meets some requirements
- 30-49: Poor match, significant gaps
- 0-29: Very poor match, doesn't meet requirements

Respond with a JSON object containing:
{
  "score": <number 0-100>,
  "reasoning": "<brief explanation of why this score>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"]
}`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are an expert evaluator. Your task is to evaluate component matches and provide detailed feedback. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const evaluation = extractJSON(response.message);

    return {
      success: true,
      componentId,
      ...evaluation
    };
  } catch (error) {
    logger.error('Error evaluating component match:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a new persona specification using AI with Structured Outputs
 */
async function generatePersona({ name, personality, pronouns = 'they/them', topic, emotionRange }) {
  try {
    const prompt = `Create a detailed persona specification following the LEIA Designer format.

Requirements:
- First name: ${name || 'Generate an appropriate first name'}
- Personality: ${personality}
- Topic expertise: ${topic}
- Pronouns: ${pronouns}

Create a complete persona with:
1. metadata.name in kebab-case based on the firstName
2. spec.firstName as the actual first name
3. spec.fullName can be same as firstName or include last name
4. spec.description: brief 1-2 sentence description
5. spec.personality: detailed 2-3 paragraph personality description including the topic expertise
6. All pronoun fields correctly filled based on "${pronouns}":
   - subjectPronoum: he/she/they
   - objectPronoum: him/her/them
   - possesivePronoum: his/hers/theirs
   - possesiveAdjective: his/her/their`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: [
        {
          role: 'system',
          content: 'You are a LEIA persona designer. Create detailed persona specifications following the exact LEIA Designer structure.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: PERSONA_SCHEMA
    });

    const persona = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      persona
    };
  } catch (error) {
    logger.error('Error generating persona:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a new problem specification using AI with Structured Outputs
 */
async function generateProblem({ topic, difficulty, description, solutionFormat, process, includeBackground = true }) {
  try {
    const finalSolutionFormat = solutionFormat || 'text';
    const finalProcess = process || 'requirements-elicitation';

    const prompt = `Create a detailed problem specification following the LEIA Designer format.

Requirements:
- Topic: ${topic}
- Difficulty: ${difficulty || 'intermediate'}
- Solution format: ${finalSolutionFormat}
- Process: ${finalProcess}
- Description base: ${description || 'Generate an appropriate problem description'}
- Include background: ${includeBackground}

Create a complete problem with:
1. metadata.name in kebab-case based on topic
2. spec.description: clear problem statement
3. spec.personaBackground: background information for the persona (empty string if includeBackground is false)
4. spec.details: additional context and requirements
5. spec.solution: expected solution or solution guidance
6. spec.solutionFormat: must be one of: text, mermaid, yaml, markdown, html, json, xml
7. spec.process: array with one or more of: requirements-elicitation, game`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: [
        {
          role: 'system',
          content: 'You are a LEIA problem designer. Create detailed problem specifications following the exact LEIA Designer structure.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: PROBLEM_SCHEMA
    });

    const problem = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      problem
    };
  } catch (error) {
    logger.error('Error generating problem:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a new behaviour specification using AI with Structured Outputs
 */
async function generateBehaviour({ role, process, approach, personaName }) {
  try {
    const finalProcess = process || 'requirements-elicitation';

    const prompt = `Create a detailed behaviour specification following the LEIA Designer format.

Requirements:
- Role: ${role}
- Process: ${finalProcess}
- Teaching approach: ${approach}
- Associated persona: ${personaName || 'Generic'}

Create a complete behaviour with:
1. metadata.name in kebab-case based on role and approach
2. spec.description: brief 1-2 sentence description
3. spec.role: detailed multi-paragraph instructions for the persona including:
   - How to act in this role
   - The teaching approach (${approach})
   - How to interact with students
   - Specific guidance and examples
4. spec.process: array with one or more of: requirements-elicitation, game

The spec.role field should be comprehensive and include all instructions the persona needs to perform this role effectively.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: [
        {
          role: 'system',
          content: 'You are a LEIA behaviour designer. Create detailed behaviour specifications following the exact LEIA Designer structure.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: BEHAVIOUR_SCHEMA
    });

    const behaviour = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      behaviour
    };
  } catch (error) {
    logger.error('Error generating behaviour:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate that all LEIA components work together cohesively
 */
async function validateLeiaSpec({ persona, problem, behaviour }) {
  try {
    const prompt = `You are a LEIA specification validator. Evaluate if these components work together cohesively.

Persona:
${JSON.stringify(persona, null, 2)}

Problem:
${JSON.stringify(problem, null, 2)}

Behaviour:
${JSON.stringify(behaviour, null, 2)}

Check for:
1. Topic alignment: Does the persona's expertise match the problem topic?
2. Process compatibility: Does the behaviour process align with the problem process?
3. Difficulty appropriateness: Is the persona suitable for the problem difficulty?
4. Overall coherence: Do these components form a cohesive learning experience?

Respond with a JSON object:
{
  "valid": <true/false>,
  "score": <number 0-100>,
  "issues": ["<issue 1>", "<issue 2>"],
  "suggestions": ["<suggestion 1>", "<suggestion 2>"],
  "summary": "<brief validation summary>"
}`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are a LEIA specification validator. Evaluate component coherence. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const validation = extractJSON(response.message);

    return {
      success: true,
      ...validation
    };
  } catch (error) {
    logger.error('Error validating LEIA spec:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Refine a component based on user feedback using Structured Outputs
 */
async function refineComponent({ componentType, component, refinementInstructions }) {
  try {
    // Select the appropriate schema based on component type
    let responseSchema;
    switch (componentType) {
      case 'persona':
        responseSchema = PERSONA_SCHEMA;
        break;
      case 'problem':
        responseSchema = PROBLEM_SCHEMA;
        break;
      case 'behaviour':
        responseSchema = BEHAVIOUR_SCHEMA;
        break;
      default:
        throw new Error(`Unknown component type: ${componentType}`);
    }

    const prompt = `You are refining a LEIA ${componentType} based on user feedback.

Current ${componentType}:
${JSON.stringify(component, null, 2)}

User refinement instructions:
${refinementInstructions}

Apply the user's refinement instructions to improve the component while maintaining its core structure and purpose. Keep all existing fields unless specifically asked to change them.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: [
        {
          role: 'system',
          content: `You are a LEIA ${componentType} refiner. Apply user feedback to improve components while maintaining their structure.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: responseSchema
    });

    const refined = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      componentType,
      component: refined
    };
  } catch (error) {
    logger.error('Error refining component:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyze user requirements to extract structured information
 */
async function analyzeRequirements({ userPrompt }) {
  try {
    const prompt = `You are analyzing a user's request to create a LEIA (Learning Experience with Intelligent Agents).

User request:
"${userPrompt}"

Extract structured requirements including:
1. Topic/subject area
2. Desired difficulty level (beginner/intermediate/advanced)
3. Teaching approach (socratic, direct, encouraging, etc.)
4. Persona characteristics if mentioned
5. Problem type preferences
6. Solution format (text/mermaid)
7. Process type (requirements-elicitation/game)

Respond with a JSON object:
{
  "topic": "<extracted topic>",
  "difficulty": "<beginner|intermediate|advanced>",
  "approach": "<teaching approach>",
  "personaPreferences": {
    "personality": "<desired personality traits>",
    "emotionRange": "<emotion characteristics>"
  },
  "problemPreferences": {
    "solutionFormat": "<text|mermaid>",
    "includeBackground": <true|false>
  },
  "process": "<requirements-elicitation|game>",
  "summary": "<brief summary of what user wants to create>"
}`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are a requirements analyst for LEIA creation. Extract structured information from user requests. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const requirements = extractJSON(response.message);

    return {
      success: true,
      requirements
    };
  } catch (error) {
    logger.error('Error analyzing requirements:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search for existing LEIAs in the Designer catalog
 * If userToken is provided, searches both public and user's private LEIAs
 */
async function searchExistingLeias({ search, limit = 5 }, userToken = null) {
  try {
    const params = {};
    if (search) params.search = search;
    if (limit) params.limit = limit;

    let response;
    if (userToken) {
      response = await wizardAPI.get('/api/v1/wizard/search/leias', {
        params,
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
    } else {
      response = await catalogAPI.get('/api/v1/catalog/leias', { params });
    }

    return {
      success: true,
      count: response.data.count,
      leias: response.data.leias.map(l => ({
        id: l._id,
        name: l.metadata.name,
        description: l.metadata.description,
        version: l.metadata.version
      }))
    };
  } catch (error) {
    logger.error('Error searching LEIAs:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Load a complete LEIA by ID with all components
 */
async function loadLeiaById({ leiaId }) {
  try {
    const response = await catalogAPI.get(`/api/v1/catalog/leias/${leiaId}`);

    const leia = response.data;

    return {
      success: true,
      leia: {
        id: leia._id,
        name: leia.metadata.name,
        description: leia.metadata.description,
        persona: leia.spec.personaId || leia.spec.persona,
        problem: leia.spec.problemId || leia.spec.problem,
        behaviour: leia.spec.behaviourId || leia.spec.behaviour
      }
    };
  } catch (error) {
    logger.error('Error loading LEIA:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clone an existing LEIA and modify components based on instructions
 */
async function cloneAndModifyLeia({ sourceLeia, modifications }) {
  try {
    const model = modelManager.getModel('openai', 'gpt-4o');

    // Clone the source components
    let persona = JSON.parse(JSON.stringify(sourceLeia.persona));
    let problem = JSON.parse(JSON.stringify(sourceLeia.problem));
    let behaviour = JSON.parse(JSON.stringify(sourceLeia.behaviour));

    // Modify persona if requested
    if (modifications.persona) {
      const result = await refineComponent({
        componentType: 'persona',
        component: persona,
        refinementInstructions: modifications.persona
      });
      if (result.success) {
        persona = result.component;
      }
    }

    // Modify problem if requested
    if (modifications.problem) {
      const result = await refineComponent({
        componentType: 'problem',
        component: problem,
        refinementInstructions: modifications.problem
      });
      if (result.success) {
        problem = result.component;
      }
    }

    // Modify behaviour if requested
    if (modifications.behaviour) {
      const result = await refineComponent({
        componentType: 'behaviour',
        component: behaviour,
        refinementInstructions: modifications.behaviour
      });
      if (result.success) {
        behaviour = result.component;
      }
    }

    return {
      success: true,
      persona,
      problem,
      behaviour
    };
  } catch (error) {
    logger.error('Error cloning and modifying LEIA:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  analyzeRequirements,
  searchExistingPersonas,
  searchExistingProblems,
  searchExistingBehaviours,
  searchExistingLeias,
  loadLeiaById,
  cloneAndModifyLeia,
  evaluateComponentMatch,
  generatePersona,
  generateProblem,
  generateBehaviour,
  validateLeiaSpec,
  refineComponent
};
