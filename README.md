# emit.gg

A clean, Express-like WebSocket framework for Node.js.

```javascript
const { EmitApp } = require('emit.gg');

const app = new EmitApp();

app.on('/ping', (req) => {
    req.reply({ pong: true });
});

app.listen(3000);
```

## Features

- 🚀 **Express-like API** – Familiar routing and middleware patterns
- 📦 **Plugin System** – Extend functionality with plugins
- 🏠 **Rooms** – Group sockets and broadcast to channels
- 🔀 **Namespaces** – Organize events with prefixes
- ⚡ **Request/Response** – Promise-based request-reply pattern
- 🔄 **Auto-Reconnect** – Client reconnects automatically
- 🔧 **Middleware** – Global and route-specific middleware

## Installation

```bash
npm install emit.gg
```

## Quick Start

### Server

```javascript
const { EmitApp } = require('emit.gg');

const app = new EmitApp();

app.on('@connection', (req) => {
    console.log('Connected:', req.socket.id);
});

app.on('/ping', (req) => {
    req.reply({ pong: true, time: Date.now() });
});

app.listen(3000, () => {
    console.log('Server running on ws://localhost:3000');
});
```

### Client (Node.js)

```javascript
const { EmitClient } = require('emit.gg');

(async () => {
    const socket = await EmitClient.connect('ws://localhost:3000');
    
    const result = await socket.request('/ping');
    console.log(result);  // { pong: true, time: 1703602800000 }
})();
```

## API Reference

### Server

#### EmitApp

```javascript
const app = new EmitApp();
```

##### Methods

| Method | Description |
|--------|-------------|
| `app.on(event, handler)` | Register event handler |
| `app.on(event, middleware, handler)` | Handler with middleware |
| `app.use(fn)` | Add global middleware |
| `app.plugin(fn)` | Add plugin |
| `app.ns(prefix)` | Create namespace |
| `app.broadcast(event, options)` | Broadcast to all sockets |
| `app.listen(port, callback)` | Start server |
| `app.close()` | Close server |

##### System Events

| Event | Description |
|-------|-------------|
| `@connection` | Socket connected |
| `@disconnect` | Socket disconnected |
| `@error` | Error occurred |
| `@any` | Catch-all for any event |
| `@ping` | Heartbeat ping (with plugin) |

#### Request Object (req)

Every handler receives a `req` object:

```javascript
app.on('/message', (req) => {
    req.event      // Event name: '/message'
    req.data       // Data sent by client
    req.socket     // The socket that sent this
    req.app        // The EmitApp instance
    
    req.set(key, value)          // Store data on socket
    req.get(key)                 // Get stored data
    req.join('#room')            // Join a room
    req.leave('#room')           // Leave a room
    req.reply(data)              // Reply to client
    req.broadcast(event, opts)   // Broadcast to others
});
```

#### Socket

Access the underlying socket via `req.socket`:

```javascript
req.socket.id            // Unique socket ID
req.socket.data          // Custom data storage (use req.set/get instead)
req.socket.rooms         // Set of rooms joined
req.socket.emit(event, data)   // Send event to this socket
```

### Client

#### EmitClient

```javascript
const socket = await EmitClient.connect(url, options);
```

##### Options

| Option | Default | Description |
|--------|---------|-------------|
| `reconnect` | `false` | Auto-reconnect on disconnect |
| `reconnectDelay` | `1000` | Delay between reconnect attempts (ms) |
| `maxRetries` | `10` | Maximum reconnect attempts |
| `connectTimeout` | `10000` | Connection timeout (ms) |

##### Methods

| Method | Description |
|--------|-------------|
| `socket.emit(event, data)` | Fire and forget |
| `socket.request(event, data, opts)` | Request with response |
| `socket.on(event, callback)` | Listen for events |
| `socket.off(event, callback)` | Remove listener |
| `socket.ns(prefix)` | Create namespace |
| `socket.close()` | Disconnect |
| `socket.connected` | Connection status |

##### System Events

| Event | Description |
|-------|-------------|
| `@connection` | Connected to server |
| `@disconnect` | Disconnected from server |
| `@reconnect` | Reconnected after disconnect |
| `@error` | Connection error |
| `@any` | Catch-all for any event |

## Middleware

### Global Middleware

Runs for all events:

```javascript
app.use((req, next) => {
    console.log(`${req.socket.id} -> ${req.event}`);
    next();
});
```

### Route Middleware

Runs for specific events:

```javascript
const auth = (req, next) => {
    if (!req.get('user')) {
        req.reply({ error: 'Unauthorized' });
        return;
    }
    next();
};

app.on('/profile', auth, (req) => {
    req.reply({ user: req.get('user') });
});

// Multiple middleware
app.on('/admin', [auth, adminOnly], (req) => {
    req.reply({ admin: true });
});
```

## Rooms

```javascript
// Join a room
app.on('/join', (req) => {
    req.join('#' + req.data.room);
    
    // Notify others in room
    req.broadcast('user-joined', {
        data: { id: req.socket.id },
        to: '#' + req.data.room
    });
    
    req.reply({ joined: req.data.room });
});

// Broadcast to room
app.on('/message', (req) => {
    req.broadcast('message', {
        data: { text: req.data.text },
        to: '#' + req.data.room,
        includeSelf: true  // Include sender
    });
});

// App-level broadcast
app.broadcast('announcement', {
    data: { message: 'Server restarting!' },
    to: '#general'
});
```

## Namespaces

Organize events with prefixes:

```javascript
// Server
const chat = app.ns('/chat');
chat.on('/message', (req) => { ... });  // Handles '/chat/message'
chat.on('/typing', (req) => { ... });   // Handles '/chat/typing'

const game = app.ns('/game');
game.on('/move', (req) => { ... });     // Handles '/game/move'

// Nested namespaces
const lobby = game.ns('/lobby');
lobby.on('/join', (req) => { ... });    // Handles '/game/lobby/join'
```

```javascript
// Client
const chat = socket.ns('/chat');
await chat.request('/message', { text: 'Hello!' });
```

## Plugins

### Using Plugins

```javascript
const { EmitApp } = require('emit.gg');
const heartbeat = require('emit.gg/src/plugins/heartbeat');

const app = new EmitApp();

app.plugin(heartbeat({ interval: 30000 }));

// Multiple plugins
app.plugin([
    heartbeat({ interval: 30000 }),
    myPlugin({ option: true })
]);
```

### Creating Plugins

```javascript
// my-plugin.js
module.exports = ({ option = false } = {}) => {
    return (app) => {
        app.use((req, next) => {
            // Plugin logic
            next();
        });
        
        app.on('@connection', (req) => {
            // Setup on connection
        });
    };
};
```

### Built-in Plugins

#### Heartbeat

Keeps connections alive with ping/pong:

```javascript
const heartbeat = require('emit.gg/src/plugins/heartbeat');

app.plugin(heartbeat({ interval: 30000 }));

app.on('@ping', (req) => {
    console.log('Heartbeat:', req.socket.id);
});
```

## Symbols

| Symbol | Meaning | Example |
|--------|---------|---------|
| `@` | System event | `@connection`, `@disconnect` |
| `/` | User event | `/ping`, `/message` |
| `#` | Room | `#general`, `#game-123` |

## Examples

### Chat Application

```javascript
// Server
const { EmitApp } = require('emit.gg');
const heartbeat = require('emit.gg/src/plugins/heartbeat');

const app = new EmitApp();
app.plugin(heartbeat({ interval: 30000 }));

app.on('@connection', (req) => {
    console.log('Connected:', req.socket.id);
});

app.on('/join', (req) => {
    req.set('username', req.data.username);
    req.join('#chat');
    
    req.broadcast('user-joined', {
        data: { username: req.data.username },
        to: '#chat'
    });
    
    req.reply({ joined: true });
});

app.on('/message', (req) => {
    req.broadcast('message', {
        data: {
            username: req.get('username'),
            text: req.data.text
        },
        to: '#chat',
        includeSelf: true
    });
});

app.listen(3000);
```

```javascript
// Client
const { EmitClient } = require('emit.gg');

(async () => {
    const socket = await EmitClient.connect('ws://localhost:3000', {
        reconnect: true
    });
    
    await socket.request('/join', { username: 'Alice' });
    
    socket.on('message', (data) => {
        console.log(`${data.username}: ${data.text}`);
    });
    
    socket.emit('/message', { text: 'Hello everyone!' });
})();
```

## License

MIT
