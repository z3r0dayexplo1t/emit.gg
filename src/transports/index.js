/**
 * emit.gg - Transport Auto-Detection
 * Automatically selects the appropriate transport based on runtime
 */

/**
 * Detects if running in Bun
 */
function isBun() {
    return typeof Bun !== 'undefined';
}

/**
 * Creates the appropriate transport for the current runtime
 */
function createTransport() {
    if (isBun()) {
        const { BunTransport } = require('./bun');
        return new BunTransport();
    } else {
        const { NodeTransport } = require('./node');
        return new NodeTransport();
    }
}

/**
 * Gets the transport class for a specific runtime
 */
function getTransport(runtime) {
    if (runtime === 'bun') {
        const { BunTransport } = require('./bun');
        return BunTransport;
    } else if (runtime === 'node') {
        const { NodeTransport } = require('./node');
        return NodeTransport;
    }
    throw new Error(`Unknown runtime: ${runtime}`);
}

module.exports = {
    createTransport,
    getTransport,
    isBun
};

// Re-export transports for direct access
module.exports.NodeTransport = require('./node').NodeTransport;
// Only export BunTransport if we're in Bun (avoid errors in Node)
if (isBun()) {
    module.exports.BunTransport = require('./bun').BunTransport;
}
