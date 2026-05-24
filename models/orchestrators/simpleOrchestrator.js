const BaseOrchestrator = require('./baseOrchestrator');

class SimpleOrchestrator extends BaseOrchestrator {
  constructor() {
    super();
    this.name = 'simpleOrchestrator';
  }

  selectLeia(leias = []) {
    if (!Array.isArray(leias) || leias.length === 0) {
      return null;
    }

    return leias[Math.floor(Math.random() * leias.length)];
  }
}

module.exports = new SimpleOrchestrator();
