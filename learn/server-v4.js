const { WebSocketServer } = require('ws');

class SimpleSocket {
    constructor(ws) {
        this.ws = ws;
        this.listeners = new Map();


        ws.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            this._callListeners(message.event, message.data)
        })

        ws.on('close', () => {
            this._callListeners('disconnect')
        })
    }

    _callListeners(event, data) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach(fn => fn(data))
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        this.listeners.get(event).push(callback)
        return this // allow chaining
    }


    emit(event, data) {
        this.ws.send(JSON.stringify({
            event,
            data
        }))

        return this
    }
}


const server = new WebSocketServer({ port: 3000 })

server.on('connection', (ws) => {
    const socket = new SimpleSocket(ws);

    console.log('Client connnected')
})