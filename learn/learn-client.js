const { EmitClient } = require('./client-v5');

(async () => {
    const socket = await EmitClient.connect('ws://localhost:3000', {
        reconnect: true,
        reconnectDelay: 2000,
        maxRetries: 5
    });

    // System events
    socket.on('@disconnect', () => {
        console.log('Disconnected, attempting reconnect...');
    });

    socket.on('@reconnect', () => {
        console.log('Reconnected!');
    });

    socket.on('@error', (err) => {
        console.log('Error:', err.error);
    });

    socket.on('@any', ({ event, data }) => {
        console.log('Received:', event, data);
    });

    // Custom data
    socket.data.userId = 123;

    // Request with custom timeout
    const result = await socket.request('/join', { room: 'general' }, { timeout: 5000 });
    console.log('Joined:', result);

    // Check connection status
    console.log('Connected:', socket.connected);
})();