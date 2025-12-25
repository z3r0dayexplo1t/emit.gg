const { WebSocketServer } = require('ws');
const server = new WebSocketServer({ port: 3000 })


server.on('connection', (ws) => {
    console.log('Client connected')

    const listeners = new Map();

    function on(event, callback) {
        if (!listeners.has(event)) {
            listeners.set(event, []);
        }

        listeners.get(event).push(callback);
    }

    function emit(event, data) {
        ws.send(JSON.stringify({
            event,
            data
        }))
    }


    ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        const handlers = listeners.get(message.event);


        if (handlers) {
            handlers.forEach(fn => fn(message.data))
        }
    })


    on('chat', (data) => {
        console.log('Chat:', data.text)
    })

    on('ping', (data) => {
        emit('pong', { time: Date.now() })
    })
})