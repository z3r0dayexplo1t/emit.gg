# AGENTS.md - emit.gg Codebase Guide

This document helps AI agents work effectively in the emit.gg repository.

## Project Overview

emit.gg is a clean, minimal WebSocket framework with middleware, rooms, and horizontal scaling. It includes:

- **JavaScript/Node.js implementation** (main): `src/` directory
- **Go implementation** (experimental): `go/` directory
- **Key features**: WebSocket server/client, middleware, rooms, tags, namespaces, plugins, Redis scaling

## Codebase Structure

```
/
├── go/                  # Go implementation
│   ├── emit/             # Core Go packages
│   │   ├── app.go        # Main Go server
│   │   ├── namespace.go  # Namespace support
│   │   ├── request.go    # Request handling
│   │   ├── socket.go     # Socket management
│   │   └── types.go      # Type definitions
│   ├── go.mod           # Go module
│   └── main.go          # Go example server
│
├── src/                 # JavaScript implementation
│   ├── browser.js        # Browser client
│   ├── client.js         # Node.js client
│   ├── index.js          # Main exports
│   ├── server.js         # Main server
│   ├── test-client.js    # Test client
│   ├── test.js           # Test server
│   ├── plugins/          # Plugin system
│   │   ├── heartbeat.js   # Heartbeat plugin
│   │   └── redis.js       # Redis adapter
│   └── transports/       # Transport adapters
│       ├── bun.js        # Bun transport
│       ├── index.js      # Transport factory
│       └── node.js       # Node.js transport
│
├── package.json         # Node.js package config
├── README.md            # Project documentation
└── LICENSE              # MIT License
```

## Essential Commands

### Node.js/JavaScript

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run example server
npm run example

# Start test server
node src/test.js

# Run test client
node src/test-client.js
```

### Go

```bash
# Build Go implementation
cd go && go build

# Run Go server
go run main.go
```

## Code Patterns and Conventions

### JavaScript Implementation

#### Event Naming
- `@connection`, `@disconnect`, `@error`, `@any`, `@ping` - System events
- `/event` - User events (e.g., `/ping`, `/message`)
- `#room` - Rooms (e.g., `#general`, `#game-123`)
- `*tag` - Tags (e.g., `*admin`, `*premium`)

#### Core Classes
- **App**: Main server class (`src/server.js`)
- **Socket**: Individual socket connection
- **Namespace**: Event namespacing
- **Client**: WebSocket client
- **ClientNamespace**: Client-side namespacing

#### Message Format
All messages are JSON with this structure:
```json
{
  "event": "event-name",
  "data": {},
  "ackId": "uuid"  // For request/response
}
```

#### Error Handling
- Global error handler via `@error` event
- Middleware can call `next()` or return early
- Async errors caught and sent to error handler

### Go Implementation

#### Key Types
- **App**: Main server (`go/emit/app.go`)
- **Socket**: Connection management
- **Namespace**: Prefixed event routing
- **Request**: Request context
- **Message**: WebSocket message structure

#### Concurrency
- Uses `sync.Map` for thread-safe collections
- Goroutines for socket I/O (`readPump`, `writePump`)
- Context for graceful shutdown

## Testing Approach

### Test Files
- `src/test.js` - Basic server test
- `src/test-client.js` - Basic client test
- No formal test suite found

### Testing Patterns
- Manual testing with test server/client
- Event-based verification
- Console logging for debugging

## Important Gotchas

### JavaScript

1. **Transport Abstraction**: Uses adapter pattern for Node.js/Bun compatibility
2. **Request/Response**: Uses `ackId` for tracking pending requests
3. **Room Management**: Rooms are Sets of sockets
4. **Tag System**: Tags are stored on individual sockets
5. **Namespace Prefixing**: Uses string concatenation for event names

### Go

1. **Thread Safety**: Uses `sync.Map` for concurrent access
2. **WebSocket Library**: Uses `github.com/coder/websocket`
3. **Error Handling**: Returns errors from handlers
4. **Middleware Chain**: Uses functional composition

### Cross-Cutting

1. **Event Symbols**: Consistent symbol usage across implementations
   - `@` for system events
   - `/` for user events
   - `#` for rooms
   - `*` for tags

2. **No Shared Code**: JavaScript and Go implementations are independent

3. **Plugin System**: Only in JavaScript implementation

## Development Patterns

### Adding Features
1. Implement in JavaScript first (main implementation)
2. Add to Go implementation if needed
3. Update README with examples
4. Add test cases if applicable

### Code Style
- JavaScript: Standard JS style, 4-space indentation
- Go: Standard Go formatting, gofmt compatible
- Consistent naming across implementations

## Project-Specific Context

### Key Differences Between Implementations

| Feature | JavaScript | Go |
|---------|-----------|----|
| Plugins | ✅ Yes | ❌ No |
| Redis | ✅ Yes | ❌ No |
| Heartbeat | ✅ Yes | ❌ No |
| Namespaces | ✅ Yes | ✅ Yes |
| Rooms | ✅ Yes | ✅ Yes |
| Tags | ✅ Yes | ❌ No |
| Middleware | ✅ Yes | ✅ Yes |
| Transport Abstraction | ✅ Yes | ❌ No |

### Missing from Current Codebase
- Formal test suite
- TypeScript definitions
- CI/CD configuration
- Benchmark tests
- Comprehensive error handling in Go

## Working with This Codebase

1. **Start with JavaScript**: Main implementation with full features
2. **Use test files**: `src/test.js` and `src/test-client.js` for examples
3. **Check README**: Comprehensive API documentation
4. **Go is experimental**: Limited features compared to JavaScript
5. **Plugin system**: Only available in JavaScript

## Common Tasks

### Add New Feature to JavaScript
1. Add to `src/server.js` or appropriate file
2. Export from `src/index.js`
3. Add example to README
4. Test manually with test files

### Add New Feature to Go
1. Add to appropriate file in `go/emit/`
2. Update `go/main.go` example if needed
3. Test with `go run main.go`

### Create Plugin (JavaScript only)
1. Add to `src/plugins/` directory
2. Follow heartbeat plugin pattern
3. Export from main plugin index if needed

## Working with This Codebase

1. **Start with JavaScript**: Main implementation with full features
2. **Use test files**: `src/test.js` and `src/test-client.js` for examples
3. **Check README**: Comprehensive API documentation
4. **Go is experimental**: Limited features compared to JavaScript
5. **Plugin system**: Only available in JavaScript

## Common Tasks

### Add New Feature to JavaScript
1. Add to `src/server.js` or appropriate file
2. Export from `src/index.js`
3. Add example to README
4. Test manually with test files

### Add New Feature to Go
1. Add to appropriate file in `go/emit/`
2. Update `go/main.go` example if needed
3. Test with `go run main.go`

### Create Plugin (JavaScript only)
1. Add to `src/plugins/` directory
2. Follow heartbeat plugin pattern
3. Export from main plugin index if needed
