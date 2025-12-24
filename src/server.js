/**
 * emit.gg - Server
 * Lean WebSocket server with event-based messaging
 */

const { WebSocketServer } = require('ws');
const { MessageType, encode, encodeAck, decode, generateId, createDebug } = require('./utils');

const debug = createDebug('emit:server');


class EmitSocket {
    constructor(ws, server) {
        this.ws = ws;
        this.server = server;
        this.id = generateId();
        this.rooms = new Set();
        this._listeners = new Map();
        this._pendingAcks = new Map();

        this._setupHandlers();
        debug(`socket created: ${this.id}`);
    }

    _setupHandlers() {
        this.ws.on('message', (raw) => {
            const message = decode(raw.toString());
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

            const { event, data, ackId } = message;
            debug(`event received: ${event}`, data);

            // Create ack callback if requested
            const ack = ackId ? (response) => {
                if (this.ws.readyState === 1) {
                    this.ws.send(encodeAck(ackId, response));
                    debug(`ack sent: ${ackId}`);
                }
            } : undefined;

            // Call registered listeners
            const listeners = this._listeners.get(event);
            if (listeners) {
                listeners.forEach(fn => fn(data, ack));
            }

            // Also emit on server for global listeners
            this.server._emitLocal(event, data, this, ack);
        });

        this.ws.on('close', () => {
            debug(`socket closed: ${this.id}`);
            this.rooms.forEach(room => this.leave(room));
            this.server._removeSocket(this);
            this._emitLocal('disconnect');
        });

        this.ws.on('error', (err) => {
            debug(`socket error: ${this.id}`, err.message);
            this._emitLocal('error', err);
        });
    }

    /** @private */
    _emitLocal(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(fn => fn(data));
        }
    }

    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
        return this;
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

    emit(event, data) {
        if (this.ws.readyState === 1) {
            this.ws.send(encode(event, data));
            debug(`emit to ${this.id}: ${event}`);
        }
        return this;
    }

    request(event, data, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState !== 1) {
                return reject(new Error('Socket not connected'));
            }

            const ackId = generateId();
            const timer = setTimeout(() => {
                this._pendingAcks.delete(ackId);
                reject(new Error(`Request timeout: ${event}`));
            }, timeout);

            this._pendingAcks.set(ackId, { resolve, timer });
            this.ws.send(encode(event, data, ackId));
            debug(`request to ${this.id}: ${event} (ack: ${ackId})`);
        });
    }

    join(room) {
        this.rooms.add(room);
        this.server._joinRoom(room, this);
        debug(`${this.id} joined room: ${room}`);
        return this;
    }

    leave(room) {
        this.rooms.delete(room);
        this.server._leaveRoom(room, this);
        debug(`${this.id} left room: ${room}`);
        return this;
    }


    to(room) {
        return {
            emit: (event, data) => {
                this.server._emitToRoom(room, event, data, this);
            }
        };
    }

    get broadcast() {
        return {
            emit: (event, data) => {
                this.server._broadcast(event, data, this);
            }
        };
    }

    close(code, reason) {
        this.ws.close(code, reason);
    }
}


class EmitServer {

    constructor(options = {}) {
        // Allow passing just a port number
        if (typeof options === 'number') {
            options = { port: options };
        }

        this.wss = new WebSocketServer(options);
        this.sockets = new Map();
        this.rooms = new Map();
        this._listeners = new Map();

        this._setupHandlers();
        debug(`server started on port ${options.port || 'attached'}`);
    }

    _setupHandlers() {
        this.wss.on('connection', (ws, req) => {
            const socket = new EmitSocket(ws, this);
            this.sockets.set(socket.id, socket);

            this._emitLocal('connection', socket, req);
        });

        this.wss.on('error', (err) => {
            debug('server error:', err.message);
            this._emitLocal('error', err);
        });
    }

    _emitLocal(event, ...args) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(fn => fn(...args));
        }
    }

    _removeSocket(socket) {
        this.sockets.delete(socket.id);
    }
    _joinRoom(room, socket) {
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room).add(socket);
    }

    _leaveRoom(room, socket) {
        const roomSockets = this.rooms.get(room);
        if (roomSockets) {
            roomSockets.delete(socket);
            if (roomSockets.size === 0) {
                this.rooms.delete(room);
            }
        }
    }

    _emitToRoom(room, event, data, excludeSocket = null) {
        const roomSockets = this.rooms.get(room);
        if (roomSockets) {
            roomSockets.forEach(socket => {
                if (socket !== excludeSocket) {
                    socket.emit(event, data);
                }
            });
        }
    }

    _broadcast(event, data, excludeSocket = null) {
        this.sockets.forEach(socket => {
            if (socket !== excludeSocket) {
                socket.emit(event, data);
            }
        });
    }
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
        return this;
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
    emit(event, data) {
        this.sockets.forEach(socket => {
            socket.emit(event, data);
        });
        return this;
    }

    to(room) {
        return {
            emit: (event, data) => {
                this._emitToRoom(room, event, data);
            }
        };
    }

    getSocket(id) {
        return this.sockets.get(id);
    }

    getRoom(room) {
        return this.rooms.get(room) || new Set();
    }


    get size() {
        return this.sockets.size;
    }

    close(callback) {
        return new Promise((resolve) => {
            this.wss.close(() => {
                debug('server closed');
                callback?.();
                resolve();
            });
        });
    }
}

module.exports = { EmitServer, EmitSocket };
