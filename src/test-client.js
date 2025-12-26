const { EmitClient } = require('./index');

(async () => {
    const client = await EmitClient.connect('ws://localhost:3000');

    client.on('@connection', () => {
        console.log('Connected to server');
    });

    client.on('@disconnect', () => {
        console.log('Disconnected from server');
    });

    // Listen for pong event
    client.on('pong', (data) => {
        console.log('Pong received:', data);
    });

    // Fire and forget
    client.emit('/ping');
})();