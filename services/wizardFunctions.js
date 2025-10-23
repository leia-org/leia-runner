/**
 * Function handlers for LEIA Wizard Agent
 * These functions implement the actual logic for each tool the agent can call
 */

const axios = require('axios');
const logger = require('../utils/logger');
const modelManager = require('../models/modelManager');

// Configure axios instance for Designer Backend catalog API
const catalogAPI = axios.create({
  baseURL: process.env.DESIGNER_BACKEND_URL,
  headers: {
    'x-catalog-api-key': process.env.CATALOG_API_KEY
  }
});

/**
 * Search for existing personas in the Designer catalog
 */
async function searchExistingPersonas({ topic, search, limit = 5 }) {
  try {
    const params = {};
    if (topic) params.topic = topic;
    if (search) params.search = search;
    if (limit) params.limit = limit;

    const response = await catalogAPI.get('/api/v1/catalog/personas', { params });

    return {
      success: true,
      count: response.data.count,
      personas: response.data.personas.map(p => ({
        id: p._id,
        name: p.spec.name,
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
 */
async function searchExistingProblems({ topic, difficulty, format, search, limit = 5 }) {
  try {
    const params = {};
    if (topic) params.topic = topic;
    if (difficulty) params.difficulty = difficulty;
    if (format) params.format = format;
    if (search) params.search = search;
    if (limit) params.limit = limit;

    const response = await catalogAPI.get('/api/v1/catalog/problems', { params });

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
 */
async function searchExistingBehaviours({ role, process, search, limit = 5 }) {
  try {
    const params = {};
    if (role) params.role = role;
    if (process) params.process = process;
    if (search) params.search = search;
    if (limit) params.limit = limit;

    const response = await catalogAPI.get('/api/v1/catalog/behaviours', { params });

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

    const evaluation = JSON.parse(response.message);

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
 * Generate a new persona specification using AI
 */
async function generatePersona({ name, personality, pronouns = 'they/them', topic, emotionRange }) {
  try {
    const prompt = `You are a LEIA persona designer. Create a detailed persona specification following the LEIA Designer format.

Requirements:
- First name: ${name || 'Generate an appropriate first name'}
- Personality: ${personality}
- Topic expertise: ${topic}
- Pronouns: ${pronouns}

The LEIA Designer expects personas in this exact structure:
{
  "apiVersion": "v1",
  "metadata": {
    "name": "<kebab-case-name>",
    "version": {
      "major": 1,
      "minor": 0,
      "patch": 0
    }
  },
  "spec": {
    "fullName": "<Full Name>",
    "firstName": "<FirstName>",
    "description": "<detailed description>",
    "personality": "<multi-paragraph personality description>",
    "subjectPronoum": "<he/she/they>",
    "objectPronoum": "<him/her/them>",
    "possesivePronoum": "<his/hers/theirs>",
    "possesiveAdjective": "<his/her/their>"
  }
}

Create a complete persona with:
1. metadata.name in kebab-case based on the firstName
2. spec.firstName as the actual first name
3. spec.fullName can be same as firstName or include last name
4. spec.description: brief 1-2 sentence description
5. spec.personality: detailed 2-3 paragraph personality description including the topic expertise
6. All pronoun fields correctly filled based on "${pronouns}"

Respond ONLY with the JSON object in the exact structure shown above.`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are a LEIA persona designer. Create detailed persona specifications following exact LEIA Designer structure. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const persona = JSON.parse(response.message);

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
 * Generate a new problem specification using AI
 */
async function generateProblem({ topic, difficulty, description, solutionFormat, process, includeBackground = true }) {
  try {
    const prompt = `You are a LEIA problem designer. Create a detailed problem specification following the LEIA Designer format.

Requirements:
- Topic: ${topic}
- Difficulty: ${difficulty || 'intermediate'}
- Solution format: ${solutionFormat || 'text'}
- Process: ${process || 'requirements-elicitation'}
- Description base: ${description || 'Generate an appropriate problem description'}
- Include background: ${includeBackground}

The LEIA Designer expects problems in this exact structure:
{
  "apiVersion": "v1",
  "metadata": {
    "name": "<kebab-case-name>",
    "version": {
      "major": 1,
      "minor": 0,
      "patch": 0
    }
  },
  "spec": {
    "description": "<problem description>",
    "personaBackground": "<background story for persona, empty if includeBackground is false>",
    "details": "<detailed problem information>",
    "solution": "<expected solution or solution guidance>",
    "solutionFormat": "${solutionFormat || 'text'}",
    "process": ["${process || 'requirements-elicitation'}"]
  }
}

Create a complete problem with:
1. metadata.name in kebab-case based on topic
2. spec.description: clear problem statement
3. spec.personaBackground: background information for the persona (empty string if includeBackground is false)
4. spec.details: additional context and requirements
5. spec.solution: expected solution or solution guidance
6. spec.solutionFormat: one of [text, mermaid, yaml, markdown, html, json, xml]
7. spec.process: array with one or more of [requirements-elicitation, game]

Respond ONLY with the JSON object in the exact structure shown above.`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are a LEIA problem designer. Create detailed problem specifications following exact LEIA Designer structure. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const problem = JSON.parse(response.message);

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
 * Generate a new behaviour specification using AI
 */
async function generateBehaviour({ role, process, approach, personaName }) {
  try {
    const prompt = `You are a LEIA behaviour designer. Create a detailed behaviour specification following the LEIA Designer format.

Requirements:
- Role: ${role}
- Process: ${process || 'requirements-elicitation'}
- Teaching approach: ${approach}
- Associated persona: ${personaName || 'Generic'}

The LEIA Designer expects behaviours in this exact structure:
{
  "apiVersion": "v1",
  "metadata": {
    "name": "<kebab-case-name>",
    "version": {
      "major": 1,
      "minor": 0,
      "patch": 0
    }
  },
  "spec": {
    "description": "<brief description of this behaviour>",
    "role": "<detailed multi-paragraph role instructions>",
    "process": ["${process || 'requirements-elicitation'}"]
  }
}

Create a complete behaviour with:
1. metadata.name in kebab-case based on role and approach
2. spec.description: brief 1-2 sentence description
3. spec.role: detailed multi-paragraph instructions for the persona including:
   - How to act in this role
   - The teaching approach (${approach})
   - How to interact with students
   - Specific guidance and examples
4. spec.process: array with one or more of [requirements-elicitation, game]

The spec.role field should be comprehensive and include all instructions the persona needs to perform this role effectively.

Respond ONLY with the JSON object in the exact structure shown above.`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are a LEIA behaviour designer. Create detailed behaviour specifications following exact LEIA Designer structure. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const behaviour = JSON.parse(response.message);

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

    const validation = JSON.parse(response.message);

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
 * Refine an existing component based on user feedback
 */
async function refineComponent({ componentType, component, refinementInstructions }) {
  try {
    const prompt = `You are refining a LEIA ${componentType} based on user feedback.

Current ${componentType}:
${JSON.stringify(component, null, 2)}

User refinement instructions:
${refinementInstructions}

Apply the user's refinement instructions to improve the component while maintaining its core structure and purpose.

Respond with a JSON object containing the refined ${componentType} with the same structure as the input.`;

    const provider = modelManager.getModel('default');
    const sessionData = await provider.createSession({
      instructions: 'You are a LEIA component refiner. Apply user feedback to improve components. Always respond with valid JSON.'
    });

    const response = await provider.sendMessage({
      message: prompt,
      sessionData
    });

    const refined = JSON.parse(response.message);

    return {
      success: true,
      componentType,
      refined
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

    const requirements = JSON.parse(response.message);

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

module.exports = {
  analyzeRequirements,
  searchExistingPersonas,
  searchExistingProblems,
  searchExistingBehaviours,
  evaluateComponentMatch,
  generatePersona,
  generateProblem,
  generateBehaviour,
  validateLeiaSpec,
  refineComponent
};
