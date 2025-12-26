const { WebSocketServer } = require('ws');

// ============ EMIT APP ============
class EmitApp {
    constructor(options = {}) {
        this.handlers = new Map();
        this.rooms = new Map();
        this.sockets = new Set();
        this.middleware = [];
        this.heartbeatInterval = options.heartbeat || 30000;
    }

    use(fn) {
        this.middleware.push(fn);
        return this;
    }

    on(event, handler) {
        this.handlers.set(event, handler);
        return this;
    }

    ns(prefix) {
        return new EmitNamespace(this, prefix);
    }

    broadcast(event, options = {}) {
        const { data = {}, to } = options;

        let targets;
        if (to && to.startsWith('#')) {
            targets = this.rooms.get(to) || new Set();
        } else {
            targets = this.sockets;
        }

        targets.forEach(socket => socket.emit(event, data));
        return this;
    }

    _joinRoom(room, socket) {
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room).add(socket);
    }

    _leaveRoom(room, socket) {
        const sockets = this.rooms.get(room);
        if (sockets) {
            sockets.delete(socket);
            if (sockets.size === 0) {
                this.rooms.delete(room);
            }
        }
    }

    _leaveAllRooms(socket) {
        socket.rooms.forEach(room => this._leaveRoom(room, socket));
    }

    listen(port, callback) {
        this.wss = new WebSocketServer({ port });

        this.wss.on('connection', (ws) => {
            const socket = new EmitSocket(ws, this);
            this.sockets.add(socket);

            const handler = this.handlers.get('@connection');
            if (handler) {
                handler({ socket, app: this });
            }
        });

        callback?.();
        return this;
    }

    close() {
        return new Promise((resolve) => {
            // Clear all heartbeats
            this.sockets.forEach(socket => socket._clearHeartbeat());

            this.wss.close(() => {
                resolve();
            });
        });
    }
}

// ============ NAMESPACE ============
class EmitNamespace {
    constructor(app, prefix) {
        this.app = app;
        this.prefix = prefix;
    }

    on(event, handler) {
        this.app.handlers.set(this.prefix + event, handler);
        return this;
    }

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
        this.rooms = new Set();
        this.data = {};
        this.isAlive = true;

        this._setupHeartbeat();

        ws.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            this._handleMessage(message);
        });

        ws.on('close', () => {
            this._clearHeartbeat();
            this.app._leaveAllRooms(this);
            this.app.sockets.delete(this);

            const handler = this.app.handlers.get('@disconnect');
            if (handler) {
                handler({ socket: this, app: this.app });
            }
        });

        ws.on('pong', () => {
            this.isAlive = true;
        });
    }

    _setupHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (!this.isAlive) {
                this.ws.terminate();
                return;
            }
            this.isAlive = false;
            this.ws.ping();

            const pingHandler = this.app.handlers.get('@ping');
            if (pingHandler) {
                pingHandler({ socket: this, app: this.app });
            }
        }, this.app.heartbeatInterval);
    }

    _clearHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
    }

    join(room) {
        if (!room.startsWith('#')) room = '#' + room;
        this.rooms.add(room);
        this.app._joinRoom(room, this);
        return this;
    }

    leave(room) {
        if (!room.startsWith('#')) room = '#' + room;
        this.rooms.delete(room);
        this.app._leaveRoom(room, this);
        return this;
    }

    _runMiddleware(req, done) {
        const middleware = this.app.middleware;
        let index = 0;

        const next = () => {
            if (index < middleware.length) {
                const fn = middleware[index++];
                fn(req, next);
            } else {
                done();
            }
        };

        next();
    }

    _handleMessage(message) {
        if (message.type === 'ack') {
            const pending = this.pendingRequests.get(message.ackId);
            if (pending) {
                pending.resolve(message.data);
                this.pendingRequests.delete(message.ackId);
            }
            return;
        }

        const { event, data, ackId } = message;

        const socket = this;
        const app = this.app;

        const req = {
            event,
            data: data || {},
            socket: this,
            app: this.app,

            reply: ackId
                ? (res) => this.ws.send(JSON.stringify({ type: 'ack', ackId, data: res }))
                : () => { },

            broadcast(event, options = {}) {
                const { data = {}, to, includeSelf = false } = options;

                let targets;
                if (to && to.startsWith('#')) {
                    targets = app.rooms.get(to) || new Set();
                } else {
                    targets = app.sockets;
                }

                targets.forEach(s => {
                    if (includeSelf || s !== socket) {
                        s.emit(event, data);
                    }
                });
            }
        };

        this._runMiddleware(req, () => {
            try {
                // Call @any handler first
                const anyHandler = this.app.handlers.get('@any');
                if (anyHandler) {
                    anyHandler(req);
                }

                // Call specific handler
                const handler = this.app.handlers.get(event);
                if (handler) {
                    handler(req);
                } else if (!anyHandler) {
                    console.log('No handler for:', event);
                }
            } catch (err) {
                const errorHandler = this.app.handlers.get('@error');
                if (errorHandler) {
                    errorHandler(err, req);
                } else {
                    console.error('Unhandled error:', err);
                }
            }
        });
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