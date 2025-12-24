/**
 * emit.gg
 * A lean, unopinionated WebSocket wrapper with Express-like API
 * 
*/


function server(options, onConnection) {
    const srv = new EmitServer(options);
    if (onConnection) {
        srv.on('connection', onConnection);
    }
    return srv;
}


function client(url, options) {
    return new EmitClient(url, options);
}


async function connect(url, options) {
    const c = new EmitClient(url, options);
    await c.connect();
    return c;
}

// Main export is the app factory
module.exports = emit;

// Also attach other exports to the main function
module.exports.server = server;
module.exports.client = client;
module.exports.connect = connect;

// Classes for advanced usage
module.exports.EmitApp = EmitApp;
module.exports.EmitNamespace = EmitNamespace;
module.exports.EmitServer = EmitServer;
module.exports.EmitSocket = EmitSocket;
module.exports.EmitClient = EmitClient;

// Aliases
module.exports.createApp = emit;
module.exports.createServer = server;
module.exports.createClient = client;
