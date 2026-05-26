const BaseOrchestrator = require('./baseOrchestrator');

class TurnOrchestrator extends BaseOrchestrator {
  constructor() {
    super();
    this.name = 'turnOrchestrator';
  }

  selectLeia(leias = [], nextIndex = 0) {
    if (!Array.isArray(leias) || leias.length === 0) {
      return null;
    }

    const parsedIndex = Number.parseInt(nextIndex, 10);
    const normalizedIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0
      ? parsedIndex % leias.length
      : 0;

    return {
      leia: leias[normalizedIndex],
      selectedIndex: normalizedIndex,
      nextIndex: (normalizedIndex + 1) % leias.length,
    };
  }
}

module.exports = new TurnOrchestrator();
