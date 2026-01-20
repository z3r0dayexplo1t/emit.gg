const { App } = require('./index');

const app = new App();

app.on('@connection', (req) => {
    console.log('Client connected', req.id);
});

app.on('@disconnect', (req) => {
    console.log('Client disconnected', req.id);
});


app.on('/ping', (req) => {
    console.log('Ping received from', req.id);

    // Emit event back (no ack needed)
    req.emit('pong', { time: Date.now() });
})



app.listen(3000, () => {
    console.log('Server started on port 3000');
})

