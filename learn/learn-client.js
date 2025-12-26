const { EmitClient } = require('./client-v5');

(async () => {

    const socket = await EmitClient.connect('ws://localhost:3000');

    socket.on('@connection', () => {
        console.log('Connected to server');
    })

    socket.on('@disconnect', () => {
        console.log('Disconnected from server');
    })

    socket.on('@error', (err) => {
        console.log('Error:', err);
    })


    const pong = await socket.request('/ping');
    console.log('Ping request:', pong);


    socket.emit('/chat', { text: 'Hello world' });

    socket.on('/chat', (data) => {
        console.log('Chat:', data);
    })
})()