/**
 * Function calling tools for the LEIA Wizard agent
 * These tools enable the agent to search, evaluate, generate, and validate LEIA components
 */

const WIZARD_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'analyze_requirements',
      description: 'Analyze user request to extract structured requirements for LEIA creation',
      parameters: {
        type: 'object',
        properties: {
          userPrompt: {
            type: 'string',
            description: 'The user\'s description of what they want to create'
          }
        },
        required: ['userPrompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_existing_personas',
      description: 'Search for existing personas in the Designer catalog that match criteria. Only returns published/public components. Searches across all persona fields including name, personality, description, topic, emotion range, etc.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Search term to match across all persona fields (name, personality, description, topic, emotion range, etc.)'
          },
          search: {
            type: 'string',
            description: 'Alternative search parameter - searches across all persona fields'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 5
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_existing_problems',
      description: 'Search for existing problems in the Designer catalog. Only returns published/public components. Searches across all problem fields including name, description, background, details, solution, and format.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Search term to match across all problem fields (name, description, background, details, solution, format, etc.)'
          },
          difficulty: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Filter by specific difficulty level (optional, can be combined with search)'
          },
          format: {
            type: 'string',
            enum: ['text', 'mermaid'],
            description: 'Filter by specific solution format (optional, can be combined with search)'
          },
          search: {
            type: 'string',
            description: 'Alternative search parameter - searches across all problem fields'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 5
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_existing_behaviours',
      description: 'Search for existing behaviours in the Designer catalog. Only returns published/public components. Searches across all behaviour fields including name, description, role, process, instructions, and approach.',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'Filter by specific role (e.g., product_owner, requirements_engineer) - used as exact match filter when search is not provided'
          },
          process: {
            type: 'string',
            enum: ['requirements-elicitation', 'game'],
            description: 'Filter by specific teaching process type - used as exact match filter when search is not provided'
          },
          search: {
            type: 'string',
            description: 'Search term to match across all behaviour fields (name, description, role, process, instructions, approach, etc.)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 5
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_component_match',
      description: 'Evaluate how well an existing component matches the requirements. Returns a score from 0-100.',
      parameters: {
        type: 'object',
        properties: {
          componentType: {
            type: 'string',
            enum: ['persona', 'problem', 'behaviour'],
            description: 'Type of component to evaluate'
          },
          componentId: {
            type: 'string',
            description: 'ID of the component from the catalog'
          },
          requirements: {
            type: 'object',
            description: 'Requirements to match against'
          }
        },
        required: ['componentType', 'componentId', 'requirements']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_persona',
      description: 'Generate a new persona specification using AI',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'First name of the persona'
          },
          personality: {
            type: 'string',
            description: 'Detailed personality description'
          },
          pronouns: {
            type: 'string',
            enum: ['they/them', 'he/him', 'she/her'],
            description: 'Preferred pronouns',
            default: 'they/them'
          },
          topic: {
            type: 'string',
            description: 'Subject matter expertise'
          },
          emotionRange: {
            type: 'string',
            description: 'Range of emotions the persona can express'
          }
        },
        required: ['personality', 'topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_problem',
      description: 'Generate a new problem specification using AI',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Subject area of the problem'
          },
          difficulty: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Difficulty level'
          },
          description: {
            type: 'string',
            description: 'Problem description (optional, can be generated)'
          },
          solutionFormat: {
            type: 'string',
            enum: ['text', 'mermaid'],
            description: 'Expected solution format'
          },
          process: {
            type: 'string',
            enum: ['requirements-elicitation', 'game'],
            description: 'Type of learning process'
          },
          includeBackground: {
            type: 'boolean',
            description: 'Whether to include background information',
            default: true
          }
        },
        required: ['topic', 'difficulty', 'solutionFormat', 'process']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_behaviour',
      description: 'Generate a new behaviour specification using AI',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'Role of the behaviour (e.g., product_owner)'
          },
          process: {
            type: 'string',
            enum: ['requirements-elicitation', 'game'],
            description: 'Teaching process type'
          },
          approach: {
            type: 'string',
            description: 'Teaching approach (e.g., socratic, direct, encouraging)'
          },
          personaName: {
            type: 'string',
            description: 'Associated persona name for context'
          }
        },
        required: ['role', 'process', 'approach']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'validate_leia_spec',
      description: 'Validate that all LEIA components (persona, problem, behaviour) work together cohesively',
      parameters: {
        type: 'object',
        properties: {
          persona: {
            type: 'object',
            description: 'Generated or selected persona spec'
          },
          problem: {
            type: 'object',
            description: 'Generated or selected problem spec'
          },
          behaviour: {
            type: 'object',
            description: 'Generated or selected behaviour spec'
          }
        },
        required: ['persona', 'problem', 'behaviour']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'refine_component',
      description: 'Refine an existing component based on user feedback',
      parameters: {
        type: 'object',
        properties: {
          componentType: {
            type: 'string',
            enum: ['persona', 'problem', 'behaviour'],
            description: 'Type of component to refine'
          },
          component: {
            type: 'object',
            description: 'Current component specification'
          },
          refinementInstructions: {
            type: 'string',
            description: 'User instructions for how to refine the component'
          }
        },
        required: ['componentType', 'component', 'refinementInstructions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_existing_leias',
      description: 'Search for complete existing LEIAs in the catalog. Returns full LEIA configurations including persona, problem, and behaviour. Use this when user wants to base a new LEIA on an existing one.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search term to find LEIAs by name or description'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 5
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_leia_by_id',
      description: 'Load a complete LEIA by its ID. Returns the full LEIA with persona, problem, and behaviour components. Use this after finding a LEIA to load its complete specification.',
      parameters: {
        type: 'object',
        properties: {
          leiaId: {
            type: 'string',
            description: 'The ID of the LEIA to load'
          }
        },
        required: ['leiaId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clone_and_modify_leia',
      description: 'Clone an existing LEIA and modify specific components based on user instructions. Use this when user wants to create a new LEIA based on an existing one with specific changes.',
      parameters: {
        type: 'object',
        properties: {
          sourceLeia: {
            type: 'object',
            description: 'The source LEIA to clone (persona, problem, behaviour)'
          },
          modifications: {
            type: 'object',
            description: 'Instructions for what to modify',
            properties: {
              persona: {
                type: 'string',
                description: 'Instructions for how to modify the persona (optional)'
              },
              problem: {
                type: 'string',
                description: 'Instructions for how to modify the problem (optional)'
              },
              behaviour: {
                type: 'string',
                description: 'Instructions for how to modify the behaviour (optional)'
              }
            }
          }
        },
        required: ['sourceLeia', 'modifications']
      }
    }
  }
];

/**
 * Get friendly title for a function name
 */
function getFriendlyFunctionTitle(functionName) {
  const titles = {
    analyze_requirements: 'Analyzing Requirements',
    search_existing_personas: 'Searching Existing Personas',
    search_existing_problems: 'Searching Existing Problems',
    search_existing_behaviours: 'Searching Existing Behaviours',
    search_existing_leias: 'Searching Existing LEIAs',
    load_leia_by_id: 'Loading LEIA',
    clone_and_modify_leia: 'Cloning and Modifying LEIA',
    evaluate_component_match: 'Evaluating Component Match',
    generate_persona: 'Generating Persona',
    generate_problem: 'Generating Problem',
    generate_behaviour: 'Generating Behaviour',
    validate_leia_spec: 'Validating LEIA Specification',
    refine_component: 'Refining Component'
  };
  return titles[functionName] || functionName;
}

/**
 * Get friendly description for a function call
 */
function getFriendlyFunctionDescription(functionName, args) {
  switch (functionName) {
    case 'analyze_requirements':
      return 'Extracting structured requirements from user prompt';

    case 'search_existing_personas':
      return args.topic
        ? `Searching personas about "${args.topic}"`
        : 'Searching personas in catalog';

    case 'search_existing_problems':
      return args.topic
        ? `Searching problems about "${args.topic}"${args.difficulty ? ` (${args.difficulty})` : ''}`
        : 'Searching problems in catalog';

    case 'search_existing_behaviours':
      return args.role
        ? `Searching behaviours for role "${args.role}"`
        : 'Searching behaviours in catalog';

    case 'evaluate_component_match':
      return `Evaluating ${args.componentType} match quality`;

    case 'generate_persona':
      return args.name
        ? `Creating persona "${args.name}"`
        : 'Creating new persona';

    case 'generate_problem':
      return `Creating ${args.difficulty || 'new'} problem about "${args.topic}"`;

    case 'generate_behaviour':
      return `Creating behaviour for ${args.role || 'teaching'}`;

    case 'validate_leia_spec':
      return 'Validating LEIA component coherence';

    case 'refine_component':
      return `Refining ${args.componentType}`;

    case 'search_existing_leias':
      return args.search
        ? `Searching LEIAs for "${args.search}"`
        : 'Searching LEIAs in catalog';

    case 'load_leia_by_id':
      return `Loading LEIA ${args.leiaId}`;

    case 'clone_and_modify_leia':
      const modifiedComponents = Object.keys(args.modifications || {}).filter(k => args.modifications[k]);
      return modifiedComponents.length > 0
        ? `Cloning and modifying ${modifiedComponents.join(', ')}`
        : 'Cloning LEIA';

    default:
      return '';
  }
}

module.exports = {
  WIZARD_TOOLS,
  getFriendlyFunctionTitle,
  getFriendlyFunctionDescription
};
