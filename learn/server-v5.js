const { WebSocketServer } = require('ws');

// ============ EMIT APP ============
class EmitApp {
    constructor() {
        this.handlers = new Map();
    }

    on(event, handler) {
        this.handlers.set(event, handler);
        return this;
    }

    // Create a namespace
    ns(prefix) {
        return new EmitNamespace(this, prefix);
    }

    listen(port, callback) {
        this.wss = new WebSocketServer({ port });

        this.wss.on('connection', (ws) => {
            const socket = new EmitSocket(ws, this);
            console.log('Client connected:', socket.id);

            // Fire connection handler if exists
            const handler = this.handlers.get('@connection');
            if (handler) {
                handler({ socket });
            }
        });

        callback?.();
        return this;
    }
}

// ============ NAMESPACE ============
class EmitNamespace {
    constructor(app, prefix) {
        this.app = app;
        this.prefix = prefix;
    }

    on(event, handler) {
        // Combine: '/chat' + '/message' = '/chat/message'
        const fullEvent = this.prefix + event;
        this.app.handlers.set(fullEvent, handler);
        return this;
    }

    // Nested namespaces: chat.ns('/rooms')
    ns(prefix) {
        return new EmitNamespace(this.app, this.prefix + prefix);
    }
}

// ============ SOCKET ============
class EmitSocket {
    constructor(ws, app) {
        this.ws = ws;
        this.app = app;
        this.id = Math.random().toString(36).slice(2, 10);
        this.pendingRequests = new Map();

        ws.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            this._handleMessage(message);
        });

        ws.on('close', () => {
            console.log('Client disconnected:', this.id);
            const handler = this.app.handlers.get('@disconnect');
            if (handler) {
                handler({ socket: this });
            }
        });
    }

    _handleMessage(message) {
        // Is this an ACK response?
        if (message.type === 'ack') {
            const pending = this.pendingRequests.get(message.ackId);
            if (pending) {
                pending.resolve(message.data);
                this.pendingRequests.delete(message.ackId);
            }
            return;
        }

        const { event, data, ackId } = message;

        // Find the handler
        const handler = this.app.handlers.get(event);
        if (!handler) {
            console.log('No handler for:', event);
            return;
        }

        // Build the req object (like Express!)
        const req = {
            event,
            data: data || {},
            socket: this,
            // reply() always exists, even if client didn't request ack
            reply: ackId
                ? (res) => this.ws.send(JSON.stringify({ type: 'ack', ackId, data: res }))
                : () => console.warn('Client did not request a reply')
        };

        // Call the handler
        handler(req);
    }

    emit(event, data) {
        this.ws.send(JSON.stringify({ event, data }));
        return this;
    }

    request(event, data) {
        return new Promise((resolve) => {
            const ackId = Math.random().toString(36).slice(2, 10);
            this.pendingRequests.set(ackId, { resolve });
            this.ws.send(JSON.stringify({ event, data, ackId }));
        });
    }
}

module.exports = { EmitApp };