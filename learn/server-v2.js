const { WebSocketServer } = require('ws');

const server = new WebSocketServer({ port: 3000 });


server.on('connection', (ws) => {
    console.log('Client connected')


    ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());


        console.log('Event:', message.event);
        console.log('Data:', message.data);

        if (message.event === 'chat') {
            console.log('Chat message:', message.data.text)
        }

        if (message.event === 'ping') {
            ws.send(JSON.stringify({
                event: 'pong',
                data: { time: Date.now() }
            }))
        }
    })
})

