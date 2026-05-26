const BaseOrchestrator = require('./baseOrchestrator');

class RandomOrchestrator extends BaseOrchestrator {
  constructor() {
    super();
    this.name = 'randomOrchestrator';
  }

  selectLeia(leias = [], nextIndex = 0) {
    if (!Array.isArray(leias) || leias.length === 0) {
      return null;
    }

    const selectedIndex = Math.floor(Math.random() * leias.length);

    return {
      leia: leias[selectedIndex],
      selectedIndex,
      nextIndex,
    };
  }
}

module.exports = new RandomOrchestrator();
