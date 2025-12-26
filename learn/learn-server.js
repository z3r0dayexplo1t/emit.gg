const { EmitApp } = require('./server-v5');


const app = new EmitApp();


app.on('@connection', (req) => {
    console.log('Client connected:', req.socket.id);
})


app.on('@disconnect', (req) => {
    console.log('Client disconnected:', req.socket.id);
})

app.on('/ping', (req) => {
    console.log('Ping request:', req.data);
    req.reply({ time: Date.now(), message: 'Pong' });
})

app.on('/chat', (req) => {
    console.log('Chat request:', req.data);
    req.socket.emit('/chat', `${req.data.text} back to you`);
})

app.listen(3000, () => {
    console.log('Server started on port 3000');
})

