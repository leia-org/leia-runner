const { deploy, undeploy } = require('./index');

deploy();

// Gracefully shutdown the server
process.on('SIGINT', () => {
    console.log('Received SIGINT. Gracefully shutting down...');
    undeploy();
});
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Gracefully shutting down...');
    undeploy();
});