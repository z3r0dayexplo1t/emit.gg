/**
 * emit.gg - Server
 * Clean WebSocket framework with Express-like API
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const url = require('url');

class EmitApp {
    constructor() {
        this.handlers = new Map();
        this.rooms = new Map();
        this.sockets = new Set();
        this.socketMap = new Map(); // socketId -> socket for O(1) lookup
        this.middleware = [];
    }

    _extractConnectionInfo(req) {
        const parsed = url.parse(req.url || '', true);
        return {
            headers: req.headers,
            query: parsed.query,
            path: parsed.pathname,
            ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.socket?.remoteAddress
                || null,
            origin: req.headers.origin || null,
            secure: req.socket?.encrypted || false
        };
    }

    _handleConnection(ws, req) {
        const socket = new EmitSocket(ws, this);
        const info = this._extractConnectionInfo(req);

        // Store connection info on socket
        socket.info = info;
        socket.request = req;

        this.sockets.add(socket);
        this.socketMap.set(socket.id, socket);

        const entry = this.handlers.get('@connection');
        if (entry) {
            entry.handler({ socket, app: this, req, info });
        }
    }

    plugin(plugins) {
        if (Array.isArray(plugins)) {
            plugins.forEach(fn => fn(this));
        } else {
            plugins(this);
        }
        return this;
    }

    use(fn) {
        this.middleware.push(fn);
        return this;
    }

    on(event, ...args) {
        const handler = args.pop();
        const middleware = args.flat();
        this.handlers.set(event, { handler, middleware });
        return this;
    }

    ns(prefix) {
        return new EmitNamespace(this, prefix);
    }

    broadcast(event, options = {}) {
        const { data = {}, to } = options;

        let targets;
        if (to && to.startsWith('#')) {
            // Room targeting
            targets = this.rooms.get(to) || new Set();
        } else if (to && to.startsWith('*')) {
            // Tag targeting - filter sockets by tag
            targets = new Set();
            this.sockets.forEach(socket => {
                if (socket.hasTag(to)) targets.add(socket);
            });
        } else {
            targets = this.sockets;
        }

        targets.forEach(socket => socket.emit(event, data));
        return this;
    }

    emitTo(socketId, event, data) {
        const socket = this.socketMap.get(socketId);
        if (socket) {
            socket.emit(event, data);
        }
        return this;
    }

    getSocket(socketId) {
        return this.socketMap.get(socketId) || null;
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

    listen(port, options = {}, callback) {
        // Support both listen(port, callback) and listen(port, options, callback)
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        const wssOptions = {
            port,
            maxPayload: options.maxPayload || 1024 * 1024
        };

        this.wss = new WebSocketServer(wssOptions);
        this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));

        callback?.();
        return this;
    }

    attach(server, options = {}) {
        const wssOptions = {
            server,
            maxPayload: options.maxPayload || 1024 * 1024
        };

        // Pass through any additional ws options
        if (options.path) wssOptions.path = options.path;
        if (options.verifyClient) wssOptions.verifyClient = options.verifyClient;
        if (options.perMessageDeflate !== undefined) {
            wssOptions.perMessageDeflate = options.perMessageDeflate;
        }

        this.wss = new WebSocketServer(wssOptions);
        this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));

        return this;
    }

    close() {
        return new Promise((resolve) => {
            this.wss.close(() => {
                resolve();
            });
        });
    }
}

class EmitNamespace {
    constructor(app, prefix) {
        this.app = app;
        this.prefix = prefix;
    }

    on(event, ...args) {
        const handler = args.pop();
        const middleware = args.flat();
        this.app.handlers.set(this.prefix + event, { handler, middleware });
        return this;
    }

    ns(prefix) {
        return new EmitNamespace(this.app, this.prefix + prefix);
    }
}

class EmitSocket {
    constructor(ws, app) {
        this.ws = ws;
        this.app = app;
        this.id = crypto.randomUUID();
        this.pendingRequests = new Map();
        this.rooms = new Set();
        this.tags = new Set();
        this.data = {};
        this.info = null;    // Set by _handleConnection
        this.request = null; // Set by _handleConnection

        ws.on('message', (raw) => {
            try {
                const message = JSON.parse(raw.toString());
                this._handleMessage(message);
            } catch (err) {
                const errorEntry = this.app.handlers.get('@error');
                if (errorEntry) {
                    errorEntry.handler(err, { socket: this, app: this.app, event: null, data: null });
                } else {
                    console.error('Failed to parse message:', err.message);
                }
            }
        });

        ws.on('close', () => {
            this.app._leaveAllRooms(this);
            this.app.sockets.delete(this);
            this.app.socketMap.delete(this.id);

            const entry = this.app.handlers.get('@disconnect');
            if (entry) {
                entry.handler({ socket: this, app: this.app });
            }
        });
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

    tag(name) {
        if (!name.startsWith('*')) name = '*' + name;
        this.tags.add(name);
        return this;
    }

    untag(name) {
        if (!name.startsWith('*')) name = '*' + name;
        this.tags.delete(name);
        return this;
    }

    hasTag(name) {
        if (!name.startsWith('*')) name = '*' + name;
        return this.tags.has(name);
    }

    _runMiddleware(middleware, req, done) {
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
                if (pending.timer) clearTimeout(pending.timer);
                pending.resolve(message.data);
                this.pendingRequests.delete(message.ackId);
            }
            return;
        }

        const { event, data, ackId } = message;

        const socket = this;
        const app = this.app;

        // Track if reply was called
        let replyCalled = false;

        const req = {
            event,
            data: data || {},
            socket: this,
            app: this.app,
            id: this.id,

            // Shortcut to emit to this socket
            emit: (event, data) => {
                socket.emit(event, data);
            },

            // Shortcut to set/get socket data
            set: (key, value) => {
                socket.data[key] = value;
            },
            get: (key) => {
                return socket.data[key];
            },

            // Shortcut for room management
            join: (room) => {
                socket.join(room);
            },
            leave: (room) => {
                socket.leave(room);
            },

            // Shortcut for tag management
            tag: (name) => {
                socket.tag(name);
            },
            untag: (name) => {
                socket.untag(name);
            },
            hasTag: (name) => {
                return socket.hasTag(name);
            },

            reply: ackId
                ? (res) => this.ws.send(JSON.stringify({ type: 'ack', ackId, data: res }))
                : () => { },

            broadcast(event, options = {}) {
                const { data = {}, to, includeSelf = false } = options;

                let targets;
                if (to && to.startsWith('#')) {
                    // Room targeting
                    targets = app.rooms.get(to) || new Set();
                } else if (to && to.startsWith('*')) {
                    // Tag targeting
                    targets = new Set();
                    app.sockets.forEach(s => {
                        if (s.hasTag(to)) targets.add(s);
                    });
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

        // Wrap reply to track if it was called
        if (ackId) {
            const originalReply = req.reply;
            req.reply = (data) => {
                replyCalled = true;
                originalReply(data);
            };
        }

        const handleError = (err) => {
            const errorEntry = this.app.handlers.get('@error');
            if (errorEntry) {
                errorEntry.handler(err, req);
            } else {
                console.error('Unhandled error:', err);
            }
        };

        const safeCall = (fn) => {
            try {
                const result = fn();
                if (result && typeof result.catch === 'function') {
                    result.catch(handleError);
                }
            } catch (err) {
                handleError(err);
            }
        };

        // Run global middleware first, then route middleware, then handler
        this._runMiddleware(this.app.middleware, req, () => {
            safeCall(() => {
                const anyEntry = this.app.handlers.get('@any');
                if (anyEntry) {
                    const result = anyEntry.handler(req);
                    if (result && typeof result.catch === 'function') {
                        result.catch(handleError);
                    }
                }

                const entry = this.app.handlers.get(event);
                if (entry) {
                    // Run route-specific middleware, then handler
                    this._runMiddleware(entry.middleware || [], req, () => {
                        safeCall(() => entry.handler(req));
                    });
                } else {
                    // No handler found
                    if (ackId) {
                        // Client expects a reply, send error
                        req.reply({ error: `No handler for: ${event}` });
                    } else if (!anyEntry) {
                        console.log('No handler for:', event);
                    }
                }
            });
        });
    }

    emit(event, data) {
        this.ws.send(JSON.stringify({ event, data }));
        return this;
    }

    request(event, data, options = {}) {
        return new Promise((resolve, reject) => {
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
}

module.exports = { EmitApp, EmitSocket, EmitNamespace };
