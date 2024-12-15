const express = require('express');
const path = require('path');
const open = require('open');

const app = express();
let server;

function startVisualizationServer(data) {
    return new Promise((resolve) => {
        app.use(express.static(path.join(__dirname, 'public')));

        app.get('/data', (req, res) => {
            res.json(data);
        });

        server = app.listen(3000, async () => {
            console.log('Server running at http://localhost:3000');
            await open('http://localhost:3000');
            resolve();
        });
    });
}

module.exports = { startVisualizationServer };