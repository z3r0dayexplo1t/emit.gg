const { EmitApp } = require('./server-v5');

const app = new EmitApp();

// Middleware 1: Logging
app.use((req, next) => {
    console.log(`[${new Date().toISOString()}] ${req.socket.id} -> ${req.event}`);
    next();
});

// Middleware 2: Rate limiting (simple example)
const requestCounts = new Map();
app.use((req, next) => {
    const count = requestCounts.get(req.socket.id) || 0;
    if (count > 100) {
        req.reply({ error: 'Rate limited' });
        return;  // Stop chain
    }
    requestCounts.set(req.socket.id, count + 1);
    next();
});

// Middleware 3: Auth check for /admin routes
app.use((req, next) => {
    if (req.event.startsWith('/admin')) {
        if (!req.socket.isAdmin) {
            req.reply({ error: 'Unauthorized' });
            return;
        }
    }
    next();
});

// Handlers
app.on('@connection', (req) => {
    console.log('Connected:', req.socket.id);
});

app.on('/join', (req) => {
    req.socket.join('#' + req.data.room);
    req.broadcast('user-joined', {
        data: { id: req.socket.id },
        to: '#' + req.data.room
    });
    req.reply({ joined: req.data.room });
});

app.on('/admin/kick', (req) => {
    // Only runs if isAdmin middleware passed
    console.log('Admin kicking user:', req.data.userId);
    req.reply({ kicked: true });
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
});