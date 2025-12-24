/**
 * emit.gg - Server Example (Express-like API)
 * Run with: node examples/server-example.js
 * Debug:    DEBUG=emit.gg node examples/server-example.js
 */

const emit = require('../src');

// Create app (just like Express!)
const app = emit();

// ─── Middleware ────────────────────────────────────────

app.use((socket, next) => {
    console.log(`[+] Connected: ${socket.id}`);
    socket.connectedAt = Date.now();
    next();
});

app.use((socket, next) => {
    // Access query params from URL: ws://localhost:3000?token=abc
    socket.user = { id: socket.id, token: socket.query?.token };
    next();
});

app.use((socket, next) => {
    socket.emit('welcome', {
        message: 'Welcome to emit.gg!',
        yourId: socket.id
    });
    next();
});

app.use((socket, next) => {
    socket.on('disconnect', () => {
        const duration = Date.now() - socket.connectedAt;
        console.log(`[-] Disconnected: ${socket.id} (${duration}ms)`);
    });
    next();
});

// ─── Global Events ─────────────────────────────────────

app.on('ping', (socket, _, ack) => {
    if (ack) ack({ pong: Date.now() });
});

app.on('chat', (socket, data, ack) => {
    console.log(`[${socket.id}] ${data.message}`);
    if (ack) ack({ delivered: true, timestamp: Date.now() });
    socket.broadcast.emit('chat', {
        from: socket.id,
        message: data.message
    });
});

// ─── Room Namespace ────────────────────────────────────

const room = app.namespace('room');

room.on('join', (socket, data, ack) => {
    socket.join(data.room);
    console.log(`[${socket.id}] Joined room: ${data.room}`);
    if (ack) ack({ joined: data.room });
    socket.to(data.room).emit('room:user:joined', { userId: socket.id });
});

room.on('leave', (socket, data, ack) => {
    socket.leave(data.room);
    console.log(`[${socket.id}] Left room: ${data.room}`);
    if (ack) ack({ left: data.room });
    socket.to(data.room).emit('room:user:left', { userId: socket.id });
});

room.on('message', (socket, data) => {
    socket.to(data.room).emit('room:message', {
        from: socket.id,
        room: data.room,
        message: data.message
    });
});

// ─── User Namespace ────────────────────────────────────

const user = app.namespace('user');

user.on('profile', (socket, _, ack) => {
    if (ack) ack({ user: socket.user, connectedAt: socket.connectedAt });
});

user.on('update', async (socket, data, ack) => {
    console.log(`[${socket.id}] Updating profile:`, data);
    // Simulate async operation
    await new Promise(r => setTimeout(r, 100));
    socket.user = { ...socket.user, ...data };
    if (ack) ack({ success: true, user: socket.user });
});

// ─── Admin Namespace (nested) ──────────────────────────

const admin = app.namespace('admin');

admin.on('stats', (socket, _, ack) => {
    if (ack) ack({
        connections: app.sockets.size,
        uptime: process.uptime()
    });
});

const adminUsers = admin.namespace('users');

adminUsers.on('list', (socket, data, ack) => {
    const users = Array.from(app.sockets).map(s => ({
        id: s.id,
        rooms: Array.from(s.rooms)
    }));
    if (ack) ack({ users, page: data?.page || 1 });
});

adminUsers.on('kick', (socket, data, ack) => {
    const target = app.server?.getSocket(data.userId);
    if (target) {
        target.emit('kicked', { reason: data.reason });
        target.close();
        if (ack) ack({ kicked: true });
    } else {
        if (ack) ack({ kicked: false, error: 'User not found' });
    }
});

// ─── Start Server ──────────────────────────────────────

app.listen(3000, () => {
    console.log('🚀 emit.gg server running on ws://localhost:3000');
    console.log('\nNamespaces:');
    console.log('  room:*        - room:join, room:leave, room:message');
    console.log('  user:*        - user:profile, user:update');
    console.log('  admin:*       - admin:stats');
    console.log('  admin:users:* - admin:users:list, admin:users:kick');
    console.log('');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await app.close();
    console.log('Server closed');
    process.exit(0);
});
