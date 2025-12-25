const { WebSocketServer } = require('ws');


const server = new WebSocketServer({ port: 3000 });

server.on('connection', (ws) => {

    console.log('Client connected');

    ws.on('message', (raw) => {
        console.log('Received:', raw.toString());
    })

    ws.on('close', () => {
        console.log('Client disconnected')
    })

    ws.send('Welcome to the server')
})