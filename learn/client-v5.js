const WebSocket = require('ws');

class EmitClient {
    constructor(ws) {
        this.ws = ws;
        this.listeners = new Map();
        this.pendingRequests = new Map();

        ws.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            this._handleMessage(message);
        });

        ws.on('close', () => {
            this._callListeners('/disconnect', {});
        });
    }

    // Static method for clean connection
    static connect(url) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);

            ws.on('open', () => {
                const client = new EmitClient(ws);
                resolve(client);
            });

            ws.on('error', (err) => {
                reject(err);
            });
        });
    }

    _handleMessage(message) {
        // Is this an ACK response to a request we made?
        if (message.type === 'ack') {
            const pending = this.pendingRequests.get(message.ackId);
            if (pending) {
                pending.resolve(message.data);
                this.pendingRequests.delete(message.ackId);
            }
            return;
        }

        // Regular event from server
        const { event, data } = message;
        this._callListeners(event, data);
    }

    _callListeners(event, data) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach(fn => fn(data));
        }
    }

    // Listen for server-pushed events
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        return this;
    }

    // Fire and forget
    emit(event, data) {
        this.ws.send(JSON.stringify({ event, data }));
        return this;
    }

    // Request with response (returns Promise)
    request(event, data) {
        return new Promise((resolve, reject) => {
            const ackId = Math.random().toString(36).slice(2, 10);

            // Timeout after 10 seconds
            const timer = setTimeout(() => {
                this.pendingRequests.delete(ackId);
                reject(new Error(`Request timeout: ${event}`));
            }, 10000);

            this.pendingRequests.set(ackId, {
                resolve: (data) => {
                    clearTimeout(timer);
                    resolve(data);
                }
            });

            this.ws.send(JSON.stringify({ event, data, ackId }));
        });
    }

    // Create a namespace (for organization)
    ns(prefix) {
        return new ClientNamespace(this, prefix);
    }

    close() {
        this.ws.close();
    }
}

// Client-side namespace (mirrors server)
class ClientNamespace {
    constructor(client, prefix) {
        this.client = client;
        this.prefix = prefix;
    }

    emit(event, data) {
        this.client.emit(this.prefix + event, data);
        return this;
    }

    request(event, data) {
        return this.client.request(this.prefix + event, data);
    }

    on(event, callback) {
        this.client.on(this.prefix + event, callback);
        return this;
    }

    // Nested namespace
    ns(prefix) {
        return new ClientNamespace(this.client, this.prefix + prefix);
    }
}

module.exports = { EmitClient };