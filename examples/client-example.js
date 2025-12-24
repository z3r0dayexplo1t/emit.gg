/**
 * emit.gg - Node.js Client Example
 * Run with: node examples/client-example.js
 * Debug:    DEBUG=emit.gg node examples/client-example.js
 */

const emit = require('../src');

async function main() {
    console.log('Connecting to ws://localhost:3000...\n');

    // One-liner connect!
    const client = await emit.connect('ws://localhost:3000');

    console.log('✓ Connected!\n');

    // Listen for events
    client.on('welcome', (data) => {
        console.log(`  ${data.message}`);
        console.log(`  Your ID: ${data.yourId}\n`);
    });

    client.on('chat', (data) => {
        console.log(`[Chat] ${data.from}: ${data.message}`);
    });

    client.on('disconnect', () => {
        console.log('\n✗ Disconnected');
    });

    // --- Demo: Ping ---
    console.log('Testing latency...');
    const start = Date.now();
    const pong = await client.request('ping');
    console.log(`  Latency: ${Date.now() - start}ms\n`);

    // --- Demo: Save data ---
    console.log('Saving data...');
    const result = await client.request('save-data', {
        name: 'Test Item',
        value: 42
    });
    console.log(`  Saved! ID: ${result.id}\n`);

    // --- Demo: Chat with ack ---
    console.log('Sending chat message...');
    const chatResult = await client.request('chat:send', {
        message: 'Hello from Node.js client!'
    });
    console.log(`  Delivered: ${chatResult.delivered}\n`);

    // --- Demo: Join room ---
    console.log('Joining room...');
    const roomResult = await client.request('room:join', { room: 'lobby' });
    console.log(`  Joined: ${roomResult.joined}\n`);

    console.log('Listening for events... (Ctrl+C to exit)\n');

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nDisconnecting...');
        client.disconnect();
        process.exit(0);
    });
}

main().catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
});
