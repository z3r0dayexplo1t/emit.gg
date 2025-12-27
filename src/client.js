/**
 * emit.gg - Client
 * WebSocket client with auto-reconnect and namespaces
 */

const WebSocket = require('ws');
const crypto = require('crypto');

class EmitClient {
    constructor(ws, options = {}) {
        this.ws = ws;
        this.url = ws.url;
        this.options = options;
        this.listeners = new Map();
        this.pendingRequests = new Map();
        this.data = {};
        this.reconnectAttempts = 0;

        this._setupListeners();
    }

    static connect(url, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = options.connectTimeout || 10000;

            const timer = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, timeout);

            const ws = new WebSocket(url);

            ws.on('open', () => {
                clearTimeout(timer);
                const client = new EmitClient(ws, { ...options, url });
                client._callListeners('@connection', {});
                resolve(client);
            });

            ws.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    _setupListeners() {
        this.ws.on('message', (raw) => {
            try {
                const message = JSON.parse(raw.toString());
                this._handleMessage(message);
            } catch (err) {
                this._callListeners('@error', { error: `Failed to parse message: ${err.message}` });
            }
        });

        this.ws.on('close', () => {
            this._callListeners('@disconnect', {});

            if (this.options.reconnect) {
                this._attemptReconnect();
            }
        });

        this.ws.on('error', (err) => {
            this._callListeners('@error', { error: err.message });
        });
    }

    _attemptReconnect() {
        const maxRetries = this.options.maxRetries || 10;
        const baseDelay = this.options.reconnectDelay || 1000;
        const maxDelay = this.options.maxReconnectDelay || 30000;

        if (this.reconnectAttempts >= maxRetries) {
            this._callListeners('@error', { error: 'Max reconnect attempts reached' });
            return;
        }

        this.reconnectAttempts++;

        // Exponential backoff with jitter
        const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
        const jitter = Math.random() * 0.3 * exponentialDelay;
        const delay = Math.min(exponentialDelay + jitter, maxDelay);

        setTimeout(() => {
            const ws = new WebSocket(this.options.url);

            ws.on('open', () => {
                this.ws = ws;
                this.reconnectAttempts = 0;
                this._setupListeners();
                this._callListeners('@reconnect', {});
            });

            ws.on('error', () => {
                this._attemptReconnect();
            });
        }, delay);
    }

    _handleMessage(message) {
        if (message.type === 'ack') {
            const pending = this.pendingRequests.get(message.ackId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(message.data);
                this.pendingRequests.delete(message.ackId);
            }
            return;
        }

        const { event, data } = message;
        this._callListeners('@any', { event, data });
        this._callListeners(event, data);
    }

    _callListeners(event, data) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach(fn => fn(data));
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(callback);
            if (index > -1) handlers.splice(index, 1);
        }
        return this;
    }

    set(key, value) {
        this.data[key] = value;
        return this;
    }

    get(key) {
        return this.data[key];
    }

    emit(event, data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ event, data }));
        }
        return this;
    }

    request(event, data, options = {}) {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error('Not connected'));
            }

            const timeout = options.timeout || 10000;
            const ackId = crypto.randomUUID();

            const timer = setTimeout(() => {
                this.pendingRequests.delete(ackId);
                reject(new Error(`Request timeout: ${event}`));
            }, timeout);

            this.pendingRequests.set(ackId, { resolve, timer });
            this.ws.send(JSON.stringify({ event, data, ackId }));
        });
    }

    ns(prefix) {
        return new ClientNamespace(this, prefix);
    }

    close() {
        this.options.reconnect = false;
        this.ws.close();
    }

    get connected() {
        return this.ws.readyState === WebSocket.OPEN;
    }
}

class ClientNamespace {
    constructor(client, prefix) {
        this.client = client;
        this.prefix = prefix;
    }

    emit(event, data) {
        this.client.emit(this.prefix + event, data);
        return this;
    }

    request(event, data, options) {
        return this.client.request(this.prefix + event, data, options);
    }

    on(event, callback) {
        this.client.on(this.prefix + event, callback);
        return this;
    }

    ns(prefix) {
        return new ClientNamespace(this.client, this.prefix + prefix);
    }
}

module.exports = { EmitClient, ClientNamespace };
