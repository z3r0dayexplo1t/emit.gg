/**
 * emit.gg
 * Clean WebSocket framework
 */

const { EmitApp, EmitSocket, EmitNamespace } = require('./server');
const { EmitClient, ClientNamespace } = require('./client');

module.exports = {
    // Server
    EmitApp,
    EmitSocket,
    EmitNamespace,

    // Client
    EmitClient,
    ClientNamespace
};
