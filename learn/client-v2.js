const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
    console.log('Connected')

    ws.send(JSON.stringify({
        event: 'chat',
        data: { text: 'Hello from client' }
    }))


    ws.send(JSON.stringify({
        event: 'ping',
        data: {}
    }))
})

ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    console.log('Received:', message)
})
