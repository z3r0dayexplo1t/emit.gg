# emit.gg 🚀

A lean, unopinionated WebSocket wrapper with an **Express-like API**. Simple event-based messaging without the bloat.

## Why emit.gg?

- **Express-like API** - Familiar `app.use()`, `app.on()`, `app.listen()` pattern
- **Namespaces** - Group handlers like Express Router: `app.namespace('room')`
- **Middleware Support** - Auth, logging, validation - just like Express
- **Lightweight** - ~5KB, minimal dependencies
- **Request/Response** - Built-in acknowledgments for RPC-style calls
- **Promise-based** - Modern async/await API
- **Zero Config** - Works out of the box

## Installation

```bash
npm install emit.gg
```

## Quick Start

### Server (Express-style)

```javascript
const emit = require('emit.gg');
const app = emit();

// Middleware
app.use((socket, next) => {
  console.log('New connection:', socket.id);
  next();
});

// Auth middleware
app.use(async (socket, next) => {
  const token = socket.query?.token;
  if (!token) return socket.close();
  socket.user = await verifyToken(token);
  next();
});

// Event handlers (like routes!)
app.on('chat', (socket, data) => {
  socket.broadcast.emit('chat', { user: socket.user.name, ...data });
});

app.on('save', async (socket, data, ack) => {
  const result = await db.save(data);
  ack({ success: true, id: result.id });
});

app.listen(3000);
```

### Client

```javascript
const emit = require('emit.gg');

// One-liner connect
const client = await emit.connect('ws://localhost:3000?token=abc');

// Simple emit
client.emit('chat', { message: 'Hello!' });

// Request with response
const result = await client.request('save', { name: 'Sam' });
console.log(result); // { success: true, id: '...' }
```

---

## API Reference

### Express-like App

```javascript
const emit = require('emit.gg');
const app = emit();
```

#### `app.use(middleware)`

Add middleware that runs on every new connection.

```javascript
// Logging
app.use((socket, next) => {
  console.log('Connected:', socket.id);
  next();
});

// Auth
app.use(async (socket, next) => {
  if (!socket.query?.token) return socket.close();
  socket.user = await auth(socket.query.token);
  next();
});

// Attach disconnect handler
app.use((socket, next) => {
  socket.on('disconnect', () => {
    console.log('Bye:', socket.id);
  });
  next();
});
```

#### `app.on(event, handler)`

Register an event handler. Handler receives `(socket, data, ack)`.

```javascript
// Simple handler
app.on('chat', (socket, data) => {
  socket.broadcast.emit('chat', data);
});

// With acknowledgment
app.on('save', async (socket, data, ack) => {
  const result = await db.save(data);
  ack({ success: true, id: result.id });
});

// Access socket properties set by middleware
app.on('profile', (socket, _, ack) => {
  ack({ user: socket.user });
});
```

#### `app.onAny(handler)`

Catch-all handler for any event.

```javascript
app.onAny((socket, event, data) => {
  console.log(`[${socket.id}] ${event}:`, data);
});
```

#### `app.listen(port, [callback])`

Start the server.

```javascript
app.listen(3000);

app.listen(3000, () => {
  console.log('Server running!');
});

// Attach to HTTP server
const http = require('http');
const server = http.createServer();
app.listen({ server });
server.listen(3000);
```

#### `app.emit(event, data)`

Emit to all connected sockets.

```javascript
app.emit('announcement', { message: 'Server restarting...' });
```

#### `app.to(room).emit(event, data)`

Emit to all sockets in a room.

```javascript
app.to('lobby').emit('message', { text: 'Hello room!' });
```

#### `app.namespace(prefix)` / `app.ns(prefix)`

Create a namespace for grouping related handlers. Like Express Router!

```javascript
const room = app.namespace('room');

room.on('join', (socket, data, ack) => { ... });   // Handles 'room:join'
room.on('leave', (socket, data, ack) => { ... });  // Handles 'room:leave'
room.on('message', (socket, data) => { ... });     // Handles 'room:message'
```

**Nested namespaces:**

```javascript
const admin = app.namespace('admin');
const users = admin.namespace('users');

users.on('list', handler);  // Handles 'admin:users:list'
users.on('kick', handler);  // Handles 'admin:users:kick'
```

**Client usage:**

```javascript
// Events are prefixed automatically
await client.request('room:join', { room: 'lobby' });
await client.request('admin:users:list', { page: 1 });
```

---

### Client

#### `emit.connect(url, [options])`

Create and connect a client in one step.

```javascript
const client = await emit.connect('ws://localhost:3000');
```

#### `emit.client(url, [options])`

Create a client without auto-connecting.

```javascript
const client = emit.client('ws://localhost:3000', {
  autoReconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10
});

await client.connect();
```

#### Client Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect (returns Promise) |
| `emit(event, data)` | Send event to server |
| `request(event, data)` | Send and wait for response (returns Promise) |
| `on(event, callback)` | Listen for events |
| `once(event, callback)` | Listen once |
| `waitFor(event)` | Wait for event (returns Promise) |
| `disconnect()` | Disconnect |

#### Client Events

```javascript
client.on('connect', () => { });
client.on('disconnect', () => { });
client.on('reconnecting', ({ attempt }) => { });
client.on('reconnect_failed', () => { });
client.on('error', (err) => { });
```

---

### Socket (Server-side)

Available in handlers and middleware:

| Property/Method | Description |
|-----------------|-------------|
| `socket.id` | Unique identifier |
| `socket.query` | URL query params |
| `socket.user` | Custom property (set in middleware) |
| `socket.emit(event, data)` | Send to this socket |
| `socket.broadcast.emit(event, data)` | Send to all except this socket |
| `socket.join(room)` | Join a room |
| `socket.leave(room)` | Leave a room |
| `socket.to(room).emit(event, data)` | Send to room |
| `socket.rooms` | Set of joined rooms |

---

## Request/Response Pattern

The killer feature! No more managing separate events:

```javascript
// Client
const user = await client.request('get-user', { id: 123 });

// Server
app.on('get-user', async (socket, data, ack) => {
  const user = await db.findById(data.id);
  ack(user);
});
```

---

## Rooms

```javascript
app.on('join', (socket, data) => {
  socket.join(data.room);
  socket.to(data.room).emit('user:joined', { id: socket.id });
});

app.on('room:message', (socket, data) => {
  socket.to(data.room).emit('message', {
    from: socket.id,
    text: data.text
  });
});
```

---

## Direct API (without Express-style)

If you prefer a simpler setup:

```javascript
const emit = require('emit.gg');

// Quick server
emit.server(3000, (socket) => {
  socket.on('chat', (data) => {
    socket.broadcast.emit('chat', data);
  });
});

// Quick client
const client = await emit.connect('ws://localhost:3000');
client.emit('chat', 'Hello!');
```

---

## Debug Mode

```bash
DEBUG=emit.gg node app.js
```

---

## Comparison

| Feature | emit.gg | Express | Socket.IO |
|---------|---------|---------|-----------|
| Middleware | ✅ | ✅ | ✅ |
| `app.on()` routes | ✅ | ✅ (.get, .post) | ❌ |
| Namespaces | ✅ | ✅ (Router) | ✅ |
| Request/Response | ✅ | ✅ | ✅ |
| Promise API | ✅ | ❌ | ❌ |
| Bundle size | ~5KB | ~200KB | ~40KB |

---

## License

MIT
