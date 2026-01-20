/**
 * emit.gg - Node.js Transport
 * WebSocket transport using the 'ws' library
 */

const { WebSocketServer } = require('ws');
const url = require('url');

/**
 * Wraps a Node.js ws WebSocket with a unified interface
 */
class NodeSocket {
    constructor(ws) {
        this._ws = ws;
        this._messageCallback = null;
        this._closeCallback = null;

        ws.on('message', (raw) => {
            if (this._messageCallback) {
                // Normalize to string
                const data = raw.toString();
                this._messageCallback(data);
            }
        });

        ws.on('close', () => {
            if (this._closeCallback) {
                this._closeCallback();
            }
        });
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
}

/**
 * Normalizes the request object from Node.js HTTP upgrade request
 */
function normalizeRequest(req) {
    const parsed = url.parse(req.url || '', true);
    return {
        headers: req.headers || {},
        query: parsed.query || {},
        path: parsed.pathname || '/',
        url: req.url || '/',
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket?.remoteAddress
            || null,
        origin: req.headers.origin || null,
        secure: req.socket?.encrypted || false
    };
}

/**
 * Node.js WebSocket transport using 'ws' library
 */
class NodeTransport {
    constructor() {
        this.wss = null;
    }

    listen(port, options, onConnection) {
        const wssOptions = {
            port,
            maxPayload: options.maxPayload || 1024 * 1024
        };

        this.wss = new WebSocketServer(wssOptions);
        this.wss.on('connection', (ws, req) => {
            const socket = new NodeSocket(ws);
            const normalizedReq = normalizeRequest(req);
            onConnection(socket, normalizedReq);
        });
    }

    attach(server, options, onConnection) {
        const wssOptions = {
            server,
            maxPayload: options.maxPayload || 1024 * 1024
        };

        // Pass through additional ws options
        if (options.path) wssOptions.path = options.path;
        if (options.verifyClient) wssOptions.verifyClient = options.verifyClient;
        if (options.perMessageDeflate !== undefined) {
            wssOptions.perMessageDeflate = options.perMessageDeflate;
        }

        this.wss = new WebSocketServer(wssOptions);
        this.wss.on('connection', (ws, req) => {
            const socket = new NodeSocket(ws);
            const normalizedReq = normalizeRequest(req);
            onConnection(socket, normalizedReq);
        });
    }

    close() {
        return new Promise((resolve) => {
            if (this.wss) {
                this.wss.close(() => resolve());
            } else {
                resolve();
            }
        });
    }
}

module.exports = { NodeTransport, NodeSocket, normalizeRequest };
