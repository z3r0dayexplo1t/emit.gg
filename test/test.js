/**
 * emit.gg - Test Suite
 * Run with: npm test
 * Debug:    DEBUG=emit.gg npm test
 */

const emit = require('../src');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.log(`  ✗ ${message}`);
        failed++;
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('\n🧪 emit.gg Tests\n');

    // Test 1: Express-like App
    console.log('Express-like API:');
    const app = emit();
    assert(typeof app.use === 'function', 'app has use() method');
    assert(typeof app.on === 'function', 'app has on() method');
    assert(typeof app.listen === 'function', 'app has listen() method');

    // Test 2: Middleware
    console.log('\nMiddleware:');
    let middlewareCalled = false;
    let middlewareOrder = [];

    app.use((socket, next) => {
        middlewareCalled = true;
        middlewareOrder.push(1);
        socket.testValue = 'hello';
        next();
    });

    app.use((socket, next) => {
        middlewareOrder.push(2);
        next();
    });

    app.listen(3456);

    const client = await emit.connect('ws://localhost:3456');
    await sleep(100);

    assert(middlewareCalled, 'middleware was called');
    assert(middlewareOrder.join(',') === '1,2', 'middleware runs in order');

    // Test 3: Event Handlers
    console.log('\nEvent Handlers:');
    let eventReceived = null;

    app.on('test-event', (socket, data) => {
        eventReceived = data;
    });

    client.emit('test-event', { foo: 'bar' });
    await sleep(50);

    assert(eventReceived?.foo === 'bar', 'app.on() receives events');

    // Test 4: Request/Ack
    console.log('\nRequest/Ack:');

    app.on('echo', (socket, data, ack) => {
        if (ack) ack({ echo: data, time: Date.now() });
    });

    const response = await client.request('echo', { message: 'hello' });
    assert(response.echo.message === 'hello', 'ack returns correct data');
    assert(typeof response.time === 'number', 'ack includes timestamp');

    // Test 5: onAny
    console.log('\nonAny Handler:');
    let anyEventCaptured = null;

    app.onAny((socket, event, data) => {
        anyEventCaptured = { event, data };
    });

    client.emit('random-event', { random: true });
    await sleep(50);

    assert(anyEventCaptured?.event === 'random-event', 'onAny captures event name');
    assert(anyEventCaptured?.data?.random === true, 'onAny captures event data');

    // Test 6: emit.connect()
    console.log('\nemit.connect():');
    client.disconnect();
    await app.close();
    await sleep(100);

    const app2 = emit();
    app2.on('ping', (s, d, ack) => ack && ack({ pong: true }));
    app2.listen(3457);

    const client2 = await emit.connect('ws://localhost:3457');
    assert(client2.connected, 'emit.connect() returns connected client');

    const pong = await client2.request('ping');
    assert(pong.pong === true, 'client2 can request/respond');

    // Test 7: emit.server() with inline handler
    console.log('\nemit.server() with handler:');
    client2.disconnect();
    await app2.close();
    await sleep(100);

    let inlineHandlerCalled = false;
    const server = emit.server(3458, (socket) => {
        inlineHandlerCalled = true;
    });

    const client3 = await emit.connect('ws://localhost:3458');
    await sleep(50);

    assert(inlineHandlerCalled, 'inline connection handler called');

    // Cleanup
    client3.disconnect();
    await server.close();
    await sleep(100);

    // Test 8: Namespaces
    console.log('\nNamespaces:');

    const app3 = emit();
    let namespaceEventReceived = null;
    let nestedEventReceived = null;

    // Create namespace
    const room = app3.namespace('room');
    room.on('join', (socket, data, ack) => {
        namespaceEventReceived = data;
        if (ack) ack({ joined: true });
    });

    // Nested namespace
    const admin = app3.namespace('admin');
    const users = admin.namespace('users');
    users.on('list', (socket, data, ack) => {
        nestedEventReceived = data;
        if (ack) ack({ users: ['a', 'b'] });
    });

    app3.listen(3459);

    const client4 = await emit.connect('ws://localhost:3459');

    // Test namespace event
    const joinResult = await client4.request('room:join', { roomId: 'lobby' });
    assert(namespaceEventReceived?.roomId === 'lobby', 'namespace receives prefixed events');
    assert(joinResult.joined === true, 'namespace ack works');

    // Test nested namespace
    const listResult = await client4.request('admin:users:list', { page: 1 });
    assert(nestedEventReceived?.page === 1, 'nested namespace receives events');
    assert(listResult.users.length === 2, 'nested namespace ack works');

    // Test namespace shorthand (ns)
    assert(typeof app3.ns === 'function', 'app.ns() shorthand exists');

    client4.disconnect();
    await app3.close();

    // Results
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(40) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
