const { EmitApp } = require('./index');

const app = new EmitApp();

app.on('@connection', (req) => {
    console.log('Client connected', req.socket.id);
});

app.on('@disconnect', (req) => {
    console.log('Client disconnected', req.socket.id);
});


app.on('/ping', (req) => {
    console.log('Ping received from', req.socket.id);

    // Emit event back (no ack needed)
    req.socket.emit('pong', { time: Date.now() });
})

app.listen(3000, () => {
    console.log('Server started on port 3000');
})