/**
 * emit.gg - Bun Transport
 * WebSocket transport using Bun's native WebSocket API
 */

/**
 * Wraps a Bun WebSocket with a unified interface
 */
class BunSocket {
    constructor(ws) {
        this._ws = ws;
        this._messageCallback = null;
        this._closeCallback = null;
    }

    send(data) {
        this._ws.send(data);
    }

    close() {
        this._ws.close();
    }

    onMessage(callback) {
        this._messageCallback = callback;
    }

    onClose(callback) {
        this._closeCallback = callback;
    }

    // Called by BunTransport when message received
    _handleMessage(data) {
        if (this._messageCallback) {
            // Normalize to string
            const str = typeof data === 'string' ? data : data.toString();
            this._messageCallback(str);
        }
    }

    // Called by BunTransport when connection closes
    _handleClose() {
        if (this._closeCallback) {
            this._closeCallback();
        }
    }
}

/**
 * Normalizes the request object from Bun's request
 */
function normalizeRequest(req) {
    const urlObj = new URL(req.url);
    const query = {};
    urlObj.searchParams.forEach((value, key) => {
        query[key] = value;
    });

    return {
        headers: Object.fromEntries(req.headers.entries()),
        query,
        path: urlObj.pathname || '/',
        url: urlObj.pathname + urlObj.search,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        origin: req.headers.get('origin') || null,
        secure: urlObj.protocol === 'https:'
    };
}

/**
 * Bun WebSocket transport using Bun's native API
 */
class BunTransport {
    constructor() {
        this.server = null;
        this._socketMap = new WeakMap(); // Maps raw Bun ws -> BunSocket
        this._onConnection = null;
    }

    listen(port, options, onConnection) {
        this._onConnection = onConnection;
        const self = this;

        this.server = Bun.serve({
            port,
            fetch(req, server) {
                // Store request data for the websocket open handler
                const upgraded = server.upgrade(req, {
                    data: { req }
                });
                if (upgraded) return undefined;

                // Not a WebSocket request
                return new Response('WebSocket upgrade required', { status: 426 });
            },
            websocket: {
                maxPayloadLength: options.maxPayload || 1024 * 1024,

                open(ws) {
                    const socket = new BunSocket(ws);
                    self._socketMap.set(ws, socket);

                    const normalizedReq = normalizeRequest(ws.data.req);
                    self._onConnection(socket, normalizedReq);
                },

                message(ws, message) {
                    const socket = self._socketMap.get(ws);
                    if (socket) {
                        socket._handleMessage(message);
                    }
                },

                close(ws) {
                    const socket = self._socketMap.get(ws);
                    if (socket) {
                        socket._handleClose();
                        self._socketMap.delete(ws);
                    }
                }
            }
        });
    }

    attach(server, options, onConnection) {
        // Bun doesn't support attaching to an existing HTTP server the same way Node does
        // For now, throw a helpful error
        throw new Error(
            'BunTransport does not support attach(). ' +
            'Use listen() instead, or use NodeTransport for HTTP server attachment.'
        );
    }

    close() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.stop();
            }
            resolve();
        });
    }
}

module.exports = { BunTransport, BunSocket, normalizeRequest };
