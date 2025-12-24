/**
 * emit.gg - Application (Express-like API)
 * Clean, middleware-based WebSocket server
 */

const { EmitServer } = require('./server');
const { createDebug } = require('./utils');

const debug = createDebug('emit:app');


class EmitApp {
    constructor() {
        this._middleware = [];
        this._handlers = new Map();
        this._anyHandlers = [];
        this._server = null;
        this._activeSockets = new Set();
    }

    use(fn) {
        this._middleware.push(fn);
        return this;
    }

    on(event, handler) {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, []);
        }
        this._handlers.get(event).push(handler);
        return this;
    }

    onAny(handler) {
        this._anyHandlers.push(handler);
        return this;
    }

    namespace(prefix, separator = ':') {
        return new EmitNamespace(this, prefix, separator);
    }
    ns(prefix, separator = ':') {
        return this.namespace(prefix, separator);
    }


    onConnection(handler) {
        this.use((socket, next) => {
            handler(socket);
            next();
        });
        return this;
    }

    async _runMiddleware(socket) {
        let index = 0;

        const next = async () => {
            if (index < this._middleware.length) {
                const middleware = this._middleware[index++];
                try {
                    await middleware(socket, next);
                } catch (err) {
                    debug('middleware error:', err.message);
                    socket.emit('error', { message: err.message });
                }
            }
        };

        await next();
        return index >= this._middleware.length;
    }

    _handleEvent(socket, event, data, ack) {
        const handlers = this._handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(socket, data, ack);
                } catch (err) {
                    debug(`handler error (${event}):`, err.message);
                }
            });
        }

        // Call any handlers
        this._anyHandlers.forEach(handler => {
            try {
                handler(socket, event, data, ack);
            } catch (err) {
                debug('onAny handler error:', err.message);
            }
        });
    }

    _setupSocket(socket) {
        this._activeSockets.add(socket);

        // Intercept socket's internal message handling to route through app handlers
        const originalListeners = socket._listeners;
        const app = this;

        // Store original on method
        const originalOn = socket.on.bind(socket);

        // Override the socket's message event listener to always check app handlers
        socket.ws.removeAllListeners('message');
        socket.ws.on('message', (raw) => {
            const { decode, MessageType, encodeAck } = require('./utils');
            const message = decode(raw.toString());
            if (!message) return;

            if (message.type === MessageType.ACK) {
                // Handle acknowledgment response (delegate to original handler)
                const pending = socket._pendingAcks.get(message.ackId);
                if (pending) {
                    clearTimeout(pending.timer);
                    pending.resolve(message.data);
                    socket._pendingAcks.delete(message.ackId);
                }
                return;
            }

            const { event, data, ackId } = message;
            debug(`event: ${event} from ${socket.id}`);

            // Create ack callback if requested
            const ack = ackId ? (response) => {
                if (socket.ws.readyState === 1) {
                    socket.ws.send(encodeAck(ackId, response));
                    debug(`ack sent: ${ackId}`);
                }
            } : undefined;

            // First, call app-level handlers
            app._handleEvent(socket, event, data, ack);

            // Then, call socket-level handlers (for middleware that adds custom handlers)
            const listeners = originalListeners.get(event);
            if (listeners) {
                listeners.forEach(fn => fn(data, ack));
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            this._activeSockets.delete(socket);
        });
    }


    listen(options, callback) {
        this._server = new EmitServer(options);

        this._server.on('connection', async (socket, req) => {
            // Parse query string from URL
            try {
                const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
                socket.query = Object.fromEntries(url.searchParams);
            } catch {
                socket.query = {};
            }

            debug(`connection: ${socket.id}`);

            // Setup event forwarding first (so handlers work immediately)
            this._setupSocket(socket);

            // Run middleware chain
            const passed = await this._runMiddleware(socket);

            if (!passed) {
                debug(`middleware rejected: ${socket.id}`);
                this._activeSockets.delete(socket);
            } else {
                debug(`socket ready: ${socket.id}`);
            }
        });

        if (callback) {
            // ws doesn't have a 'listening' event, so we call immediately
            setImmediate(callback);
        }

        debug(`listening on port ${typeof options === 'number' ? options : options.port || 'attached'}`);
        return this._server;
    }

    close() {
        if (this._server) {
            return this._server.close();
        }
        return Promise.resolve();
    }

    get server() {
        return this._server;
    }

    get sockets() {
        return this._activeSockets;
    }

    emit(event, data) {
        this._activeSockets.forEach(socket => {
            socket.emit(event, data);
        });
        return this;
    }

    to(room) {
        return {
            emit: (event, data) => {
                if (this._server) {
                    this._server.to(room).emit(event, data);
                }
            }
        };
    }
}

class EmitNamespace {
    constructor(parent, prefix, separator = ':') {
        this._parent = parent;
        this._prefix = prefix;
        this._separator = separator;
    }

    _getFullPrefix() {
        if (this._parent instanceof EmitNamespace) {
            return this._parent._getFullPrefix() + this._separator + this._prefix;
        }
        return this._prefix;
    }

    _getApp() {
        if (this._parent instanceof EmitNamespace) {
            return this._parent._getApp();
        }
        return this._parent;
    }


    on(event, handler) {
        const fullEvent = this._getFullPrefix() + this._separator + event;
        this._getApp().on(fullEvent, handler);
        return this;
    }


    namespace(prefix, separator) {
        return new EmitNamespace(this, prefix, separator ?? this._separator);
    }


    ns(prefix, separator) {
        return this.namespace(prefix, separator);
    }


    onAny(handler) {
        const prefix = this._getFullPrefix() + this._separator;
        this._getApp().onAny((socket, event, data, ack) => {
            if (event.startsWith(prefix)) {
                const localEvent = event.slice(prefix.length);
                handler(socket, localEvent, data, ack);
            }
        });
        return this;
    }


    use(fn) {
        const prefix = this._getFullPrefix() + this._separator;
        this._getApp().onAny((socket, event, data, ack) => {
            if (event.startsWith(prefix)) {
                const localEvent = event.slice(prefix.length);
                fn(socket, localEvent, data, () => { });
            }
        });
        return this;
    }
}

module.exports = { EmitApp, EmitNamespace };
