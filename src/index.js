/**
 * emit.gg
 * Clean WebSocket framework
 */

const { App, Socket, Namespace } = require('./server');
const { Client, ClientNamespace } = require('./client');

module.exports = {
    // Server
    App,
    Socket,
    Namespace,

    // Client
    Client,
    ClientNamespace
};
