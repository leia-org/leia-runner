const randomOrchestrator = require('./randomOrchestrator');
const turnOrchestrator = require('./turnOrchestrator');

const ORCHESTRATORS = {
  random: randomOrchestrator,
  randomOrchestrator,
  turn: turnOrchestrator,
  turnOrchestrator,
};

function getOrchestrator(orchestratorName = 'turn') {
  return ORCHESTRATORS[orchestratorName] || ORCHESTRATORS.turn;
}

function getAvailableOrchestrators() {
  return ['turn', 'random'];
}

module.exports = { getOrchestrator, getAvailableOrchestrators };
