/**
 * emit.gg - Client
 * Lean WebSocket client with event-based messaging
 * Works in both browser and Node.js environments
 */

const { MessageType, encode, encodeAck, decode, generateId, createDebug } = require('./utils');

const debug = createDebug('emit:client');



class EmitClient {

    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            autoReconnect: true,
            reconnectInterval: 1000,
            maxReconnectAttempts: 10,
            ackTimeout: 10000,
            protocols: undefined,
            ...options
        };

        this.id = generateId();
        this.ws = null;
        this._listeners = new Map();
        this._pendingAcks = new Map();
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._connected = false;
        this._intentionalClose = false;
        this._connectPromise = null;
    }


    connect() {
        if (this._connectPromise) {
            return this._connectPromise;
        }

        this._intentionalClose = false;

        this._connectPromise = new Promise((resolve, reject) => {
            this._connectResolve = resolve;
            this._connectReject = reject;
            this._createConnection();
        });

        return this._connectPromise;
    }

    _createConnection() {
        // Use native WebSocket in browser, or ws in Node.js
        const WS = typeof WebSocket !== 'undefined' ? WebSocket : require('ws');

        try {
            this.ws = new WS(this.url, this.options.protocols);
            debug(`connecting to ${this.url}`);
        } catch (err) {
            debug('connection error:', err.message);
            this._emitLocal('error', err);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this._connected = true;
            this._reconnectAttempts = 0;
            debug('connected');
            this._emitLocal('connect');
            this._connectResolve?.();
            this._connectPromise = null;
        };

        this.ws.onmessage = (event) => {
            const message = decode(event.data);
            if (!message) return;

            if (message.type === MessageType.ACK) {
                // Handle acknowledgment response
                const pending = this._pendingAcks.get(message.ackId);
                if (pending) {
                    clearTimeout(pending.timer);
                    pending.resolve(message.data);
                    this._pendingAcks.delete(message.ackId);
                    debug(`ack received: ${message.ackId}`);
                }
                return;
            }

            const { event: eventName, data, ackId } = message;
            debug(`event received: ${eventName}`);

            // Create ack callback if requested
            const ack = ackId ? (response) => {
                if (this.ws?.readyState === 1) {
                    this.ws.send(encodeAck(ackId, response));
                    debug(`ack sent: ${ackId}`);
                }
            } : undefined;

            this._emitLocal(eventName, data, ack);
        };

        this.ws.onclose = (event) => {
            this._connected = false;
            debug(`disconnected (code: ${event.code})`);
            this._emitLocal('disconnect', { code: event.code, reason: event.reason });

            if (!this._intentionalClose) {
                this._scheduleReconnect();
            }
        };

        this.ws.onerror = (err) => {
            debug('error:', err.message || 'unknown');
            this._emitLocal('error', err);

            // Reject connect promise on first connection failure
            if (this._connectReject && this._reconnectAttempts === 0) {
                this._connectReject(err);
                this._connectPromise = null;
            }
        };
    }

    _scheduleReconnect() {
        if (!this.options.autoReconnect) return;
        if (this.options.maxReconnectAttempts > 0 &&
            this._reconnectAttempts >= this.options.maxReconnectAttempts) {
            debug('max reconnect attempts reached');
            this._emitLocal('reconnect_failed');
            return;
        }

        this._reconnectAttempts++;
        debug(`reconnecting (attempt ${this._reconnectAttempts})`);
        this._emitLocal('reconnecting', { attempt: this._reconnectAttempts });

        this._reconnectTimer = setTimeout(() => {
            this._createConnection();
        }, this.options.reconnectInterval);
    }

    _emitLocal(event, data, ack) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(fn => fn(data, ack));
        }
    }
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
        return this;
    }
    once(event, callback) {
        const onceWrapper = (data, ack) => {
            this.off(event, onceWrapper);
            callback(data, ack);
        };
        return this.on(event, onceWrapper);
    }

    waitFor(event, timeout = 0) {
        return new Promise((resolve, reject) => {
            let timer;

            const handler = (data) => {
                if (timer) clearTimeout(timer);
                resolve(data);
            };

            this.once(event, handler);

            if (timeout > 0) {
                timer = setTimeout(() => {
                    this.off(event, handler);
                    reject(new Error(`Timeout waiting for event: ${event}`));
                }, timeout);
            }
        });
    }


    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
        return this;
    }


    removeAllListeners(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
        return this;
    }


    emit(event, data) {
        if (this.ws?.readyState === 1) {
            this.ws.send(encode(event, data));
            debug(`emit: ${event}`);
        }
        return this;
    }


    request(event, data, timeout) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== 1) {
                return reject(new Error('Not connected'));
            }

            const ackId = generateId();
            const ackTimeout = timeout ?? this.options.ackTimeout;

            const timer = setTimeout(() => {
                this._pendingAcks.delete(ackId);
                reject(new Error(`Request timeout: ${event}`));
            }, ackTimeout);

            this._pendingAcks.set(ackId, { resolve, reject, timer });
            this.ws.send(encode(event, data, ackId));
            debug(`request: ${event} (ack: ${ackId})`);
        });
    }

    get connected() {
        return this._connected;
    }

    disconnect(code, reason) {
        this._intentionalClose = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close(code, reason);
        }
        debug('disconnected (intentional)');
        return this;
    }

    close(code, reason) {
        return this.disconnect(code, reason);
    }
}

module.exports = { EmitClient };
