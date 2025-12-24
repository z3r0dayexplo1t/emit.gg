/**
 * emit.gg - Shared Utilities
 * Lightweight helpers for message encoding/decoding
 */


const MessageType = {
    EVENT: 0,
    ACK: 1
};


function encode(event, data, ackId) {
    const msg = { e: event, d: data };
    if (ackId) {
        msg.a = ackId;
        msg.t = MessageType.EVENT;
    }
    return JSON.stringify(msg);
}


function encodeAck(ackId, data) {
    return JSON.stringify({ t: MessageType.ACK, a: ackId, d: data });
}


function decode(message) {
    try {
        const parsed = JSON.parse(message);

        // Acknowledgment response
        if (parsed.t === MessageType.ACK) {
            return { type: MessageType.ACK, ackId: parsed.a, data: parsed.d };
        }

        // Regular event (with optional ack request)
        if (typeof parsed.e === 'string') {
            return {
                type: MessageType.EVENT,
                event: parsed.e,
                data: parsed.d,
                ackId: parsed.a
            };
        }

        return null;
    } catch {
        return null;
    }
}

function generateId() {
    return Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
}

function createDebug(namespace) {
    const enabled = typeof process !== 'undefined' &&
        process.env?.DEBUG?.includes('emit.gg');

    return function debug(...args) {
        if (enabled) {
            const timestamp = new Date().toISOString().substring(11, 23);
            console.log(`\x1b[36m[${timestamp}]\x1b[0m \x1b[35m${namespace}\x1b[0m`, ...args);
        }
    };
}

module.exports = {
    MessageType,
    encode,
    encodeAck,
    decode,
    generateId,
    createDebug
};
