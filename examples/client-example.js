/**
 * emit.gg - Client Example (Node.js)
 */

const { EmitClient } = require('../src');

(async () => {
    const socket = await EmitClient.connect('ws://localhost:3000', {
        reconnect: true,
        reconnectDelay: 2000,
        maxRetries: 5
    });

    // System events
    socket.on('@connection', () => {
        console.log('Connected to server');
    });

    socket.on('@disconnect', () => {
        console.log('Disconnected, attempting reconnect...');
    });

    socket.on('@reconnect', () => {
        console.log('Reconnected!');
    });

    socket.on('@error', (err) => {
        console.log('Error:', err.error);
    });

    // Ping
    const pong = await socket.request('/ping');
    console.log('Ping response:', pong);

    // Join a room
    const joinResult = await socket.request('/join', { room: 'general' });
    console.log('Joined:', joinResult);

    // Listen for messages
    socket.on('message', (data) => {
        console.log(`[${data.from}]: ${data.text}`);
    });

    socket.on('user-joined', (data) => {
        console.log(`${data.id} joined the room`);
    });

    // Send a message
    socket.emit('/message', { room: 'general', text: 'Hello everyone!' });

    // Using namespaces
    const chat = socket.ns('/chat');
    // chat.emit('/typing', {});
    // const messages = await chat.request('/history', { limit: 50 });

    console.log('Connected:', socket.connected);
})();
