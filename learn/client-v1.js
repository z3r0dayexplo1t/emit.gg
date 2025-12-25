const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');


ws.on('open', () => {
    console.log('connected to server')

    ws.send('Hello from client')
})