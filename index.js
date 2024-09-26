var http = require('http');
var express = require("express");
const { initialize } = require('@oas-tools/core');
require('dotenv').config();


const deploy = async () => {
    const serverPort = process.env.PORT || 5000;
    const app = express();
    app.use(express.json({ limit: '50mb' }));

    const config = {
        middleware: {
            security: {
                auth: {
                    apiKeyAuth: (apiKey) => {
                        const authorized = apiKey === process.env.API_KEY;
                        return { authorized: authorized };
                    },
                },
            },
        },
    };

    initialize(app, config).then(() => {
        http.createServer(app).listen(serverPort, () => {
            console.log("\nApp running at http://localhost:" + serverPort);
            console.log("________________________________________________________________");
            if (!config?.middleware?.swagger?.disable) {
                console.log('API docs (Swagger UI) available on http://localhost:' + serverPort + '/docs');
                console.log("________________________________________________________________");
            }
        });
    });
}

const undeploy = () => {
    process.exit();
};

module.exports = {
    deploy: deploy,
    undeploy: undeploy
}

