# emit.gg

A clean, minimal WebSocket framework with middleware, rooms, and horizontal scaling.

```javascript
const { EmitApp } = require('emit.gg');

const app = new EmitApp();

app.on('/ping', (req) => {
    req.reply({ pong: true });
});

app.listen(3000);
```

## Features

- 🚀 **Clean API** – Intuitive routing and middleware patterns
- 📦 **Plugin System** – Extend functionality with plugins
- 🏠 **Rooms** – Group sockets and broadcast to channels
- 🏷️ **Tags** – Label sockets for targeted messaging
- 🔀 **Namespaces** – Organize events with prefixes
- ⚡ **Request/Response** – Promise-based request-reply pattern
- 🔄 **Auto-Reconnect** – Client reconnects automatically
- 🔧 **Middleware** – Global and route-specific middleware
- 📡 **Redis Adapter** – Horizontal scaling out of the box

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
    console.log('Connected:', req.id);
    console.log('IP:', req.info.ip);
    console.log('Query:', req.info.query);
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

### Client (Browser)

Using a script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/emit.gg@1.0.4/src/browser.js"></script>
<script>
(async () => {
    const socket = await EmitClient.connect('ws://localhost:3000');
    
    socket.on('message', (data) => {
        console.log('Received:', data);
    });
    
    const result = await socket.request('/ping');
    console.log(result);
})();
</script>
```

Or with ES modules:

```html
<script type="module">
import { EmitClient } from 'emit.gg/browser';

const socket = await EmitClient.connect('ws://localhost:3000');
</script>
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
| `app.broadcast(event, options)` | Broadcast to sockets |
| `app.listen(port, [options], callback)` | Start standalone server |
| `app.attach(server, [options])` | Attach to existing HTTP server |
| `app.close()` | Close server |

##### Listen Options

```javascript
app.listen(3000, {
    maxPayload: 1024 * 1024  // Max message size (default: 1MB)
}, () => {
    console.log('Server started');
});
```

##### Attach to HTTP Server

```javascript
const http = require('http');
const { EmitApp } = require('emit.gg');

const server = http.createServer((req, res) => {
    res.end('Hello');
});

const app = new EmitApp();
app.attach(server, {
    path: '/ws',              // WebSocket path
    maxPayload: 1024 * 1024,  // Max message size
    verifyClient: (info) => { // Connection verification
        return true;
    }
});

server.listen(3000);
```

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
    // Properties
    req.event                    // Event name: '/message'
    req.data                     // Data sent by client
    req.id                       // Socket ID (shortcut)
    req.socket                   // The socket instance
    req.app                      // The EmitApp instance
    
    // Methods
    req.emit(event, data)        // Emit event to this socket
    req.set(key, value)          // Store data on socket
    req.get(key)                 // Get stored data
    req.join('#room')            // Join a room
    req.leave('#room')           // Leave a room
    req.tag('*admin')            // Add a tag
    req.untag('*admin')          // Remove a tag
    req.hasTag('*admin')         // Check if has tag
    req.reply(data)              // Reply to request
    req.broadcast(event, opts)   // Broadcast to others
});
```

#### Connection Info

Access connection details via `req.info`:

```javascript
app.on('@connection', (req) => {
    req.info.ip       // Client IP address
    req.info.query    // URL query params: { token: 'abc' }
    req.info.path     // URL path
    req.info.headers  // HTTP headers
    req.info.origin   // Origin header
    req.info.secure   // Is HTTPS/WSS
});
```

#### Socket

Access the underlying socket via `req.socket`:

```javascript
req.socket.id                    // Unique socket ID (UUID)
req.socket.data                  // Custom data storage
req.socket.rooms                 // Set of rooms joined
req.socket.tags                  // Set of tags
req.socket.info                  // Connection info
req.socket.emit(event, data)     // Send event to this socket
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
| `socket.set(key, value)` | Store data locally |
| `socket.get(key)` | Get stored data |
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
    console.log(`${req.id} -> ${req.event}`);
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
    
    req.broadcast('user-joined', {
        data: { id: req.id },
        to: '#' + req.data.room
    });
    
    req.reply({ joined: req.data.room });
});

// Broadcast to room
app.on('/message', (req) => {
    req.broadcast('message', {
        data: { text: req.data.text },
        to: '#' + req.data.room,
        includeSelf: true
    });
});

// App-level broadcast
app.broadcast('announcement', {
    data: { message: 'Server restarting!' },
    to: '#general'
});
```

## Tags

Tags allow you to label sockets for targeted messaging:

```javascript
app.on('/login', (req) => {
    req.set('userId', req.data.userId);
    
    // Tag by role
    if (req.data.isAdmin) {
        req.tag('*admin');
    }
    req.tag('*authenticated');
    
    req.reply({ success: true });
});

// Broadcast to all admins
app.broadcast('admin-alert', {
    data: { message: 'New user registered' },
    to: '*admin'
});

// Check tag in middleware
const adminOnly = (req, next) => {
    if (!req.hasTag('*admin')) {
        req.reply({ error: 'Admin only' });
        return;
    }
    next();
};
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
const heartbeat = require('emit.gg/plugins/heartbeat');

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
const heartbeat = require('emit.gg/plugins/heartbeat');

app.plugin(heartbeat({ interval: 30000 }));

app.on('@ping', (req) => {
    console.log('Heartbeat:', req.id);
});
```

## Symbols

| Symbol | Meaning | Example |
|--------|---------|---------|
| `@` | System event | `@connection`, `@disconnect` |
| `/` | User event | `/ping`, `/message` |
| `#` | Room | `#general`, `#game-123` |
| `*` | Tag | `*admin`, `*premium` |

## Scaling

### Redis Adapter

For horizontal scaling across multiple servers, use the Redis adapter:

```javascript
const Redis = require('ioredis');
const { EmitApp } = require('emit.gg');
const redisAdapter = require('emit.gg/plugins/redis');

// Create Redis clients
const redis = new Redis();  // For data storage
const pub = new Redis();    // For publishing
const sub = new Redis();    // For subscribing

const app = new EmitApp();
app.plugin(redisAdapter({ redis, pub, sub }));

app.listen(3000);
```

### Features

#### Cross-Server Broadcasts

```javascript
// Broadcasts reach all connected servers
app.broadcast('announcement', { 
    data: { text: 'Hello everyone!' },
    to: '#general'
});

// Local-only broadcast (just this server)
app.broadcast('local', { data: {}, local: true });
```

#### Direct Messaging

```javascript
// Send to specific socket (even on another server)
app.emitTo(socketId, 'notification', { text: 'Hello' });
```

#### Room Sync

```javascript
// Get room size across all servers
const count = await app.getRoomSize('#lobby');

// Get all socket IDs in room
const members = await app.getRoomMembers('#lobby');
```

#### Socket Presence

```javascript
// Total sockets across all servers
const total = await app.getTotalSockets();

// Check if socket exists
const exists = await app.socketExists(socketId);

// Get all socket IDs
const ids = await app.getAllSocketIds();
```

#### User Presence

```javascript
// Track user online status
await app.setUserOnline('user123', socketId);
await app.setUserOffline('user123');

// Check if user is online
const online = await app.isUserOnline('user123');

// Get user's socket ID
const socketId = await app.getUserSocketId('user123');

// Send message to user directly
await app.emitToUser('user123', 'notification', { text: 'Hello' });

// Get online stats
const count = await app.getOnlineUserCount();
const users = await app.getOnlineUsers();
```

#### Tags Sync

```javascript
// Sync tags to Redis
await app.syncTag(socketId, '*admin');
await app.unsyncTag(socketId, '*admin');

// Query tags across servers
const admins = await app.getTaggedSockets('*admin');
const count = await app.getTagCount('*admin');
```

### Load Balancer Setup

WebSockets require **sticky sessions**. Configure your load balancer:

#### Nginx

```nginx
upstream websocket {
    ip_hash;  # Sticky sessions
    server server1:3000;
    server server2:3000;
}

server {
    location / {
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### HAProxy

```haproxy
backend websocket
    balance source
    server server1 127.0.0.1:3001
    server server2 127.0.0.1:3002
```

## Examples

### Chat Application

```javascript
// Server
const { EmitApp } = require('emit.gg');
const heartbeat = require('emit.gg/plugins/heartbeat');

const app = new EmitApp();
app.plugin(heartbeat({ interval: 30000 }));

app.on('@connection', (req) => {
    console.log('Connected:', req.id);
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

### Scaled Chat with Redis

```javascript
const Redis = require('ioredis');
const { EmitApp } = require('emit.gg');
const heartbeat = require('emit.gg/plugins/heartbeat');
const redisAdapter = require('emit.gg/plugins/redis');

const redis = new Redis();
const pub = new Redis();
const sub = new Redis();

const app = new EmitApp();
app.plugin(heartbeat({ interval: 30000 }));
app.plugin(redisAdapter({ redis, pub, sub }));

app.on('@connection', async (req) => {
    const userId = req.info.query.userId;
    if (userId) {
        req.set('userId', userId);
        await app.setUserOnline(userId, req.id);
    }
    
    const total = await app.getTotalSockets();
    console.log(`Connected: ${req.id} (${total} total)`);
});

app.on('@disconnect', async (req) => {
    const userId = req.get('userId');
    if (userId) {
        await app.setUserOffline(userId);
    }
});

app.on('/dm', async (req) => {
    await app.emitToUser(req.data.to, 'dm', {
        from: req.get('userId'),
        text: req.data.text
    });
});

app.listen(3000);
```

## License

MIT
