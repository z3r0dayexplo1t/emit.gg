const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');


ws.on('open', () => {
    console.log('connected to server')

    ws.send('Hello from client')
})


ws.on('message', (raw) => {
    console.log('Received:', raw.toString())
})


ws.on('close', () => {
    console.log('Disconnected from server')
})