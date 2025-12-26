/**
 * emit.gg - Server Example
 */

const { EmitApp } = require('../src');
const heartbeat = require('../src/plugins/heartbeat');

const app = new EmitApp();

// Add plugins
app.plugin(heartbeat({ interval: 30000 }));

// Middleware: Logging
app.use((req, next) => {
    console.log(`[${new Date().toISOString()}] ${req.socket.id} -> ${req.event}`);
    next();
});

// System events
app.on('@connection', (req) => {
    console.log('Connected:', req.socket.id);
});

app.on('@disconnect', (req) => {
    console.log('Disconnected:', req.socket.id);
});

app.on('@ping', (req) => {
    console.log('Heartbeat:', req.socket.id);
});

app.on('@error', (err, req) => {
    console.error('Error:', err.message);
});

// User events
app.on('/ping', (req) => {
    req.reply({ pong: true, time: Date.now() });
});

app.on('/join', (req) => {
    req.socket.join('#' + req.data.room);
    req.broadcast('user-joined', {
        data: { id: req.socket.id },
        to: '#' + req.data.room
    });
    req.reply({ joined: req.data.room });
});

app.on('/message', (req) => {
    req.broadcast('message', {
        data: { from: req.socket.id, text: req.data.text },
        to: '#' + req.data.room,
        includeSelf: true
    });
});

app.on('/leave', (req) => {
    req.broadcast('user-left', {
        data: { id: req.socket.id },
        to: '#' + req.data.room
    });
    req.socket.leave('#' + req.data.room);
    req.reply({ left: req.data.room });
});

app.listen(3000, () => {
    console.log('Server running on ws://localhost:3000');
});
