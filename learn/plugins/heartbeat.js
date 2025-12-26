/**
 * Heartbeat Plugin
 * Keeps connections alive with ping/pong
 */
module.exports = (app, { interval = 30000 } = {}) => {
    app.on('@connection', ({ socket }) => {
        let isAlive = true;

        socket.ws.on('pong', () => {
            isAlive = true;
        });

        const timer = setInterval(() => {
            if (!isAlive) {
                socket.ws.terminate();
                return;
            }
            isAlive = false;
            socket.ws.ping();

            // Fire @ping event if handler exists
            const pingHandler = app.handlers.get('@ping');
            if (pingHandler) {
                pingHandler({ socket, app });
            }
        }, interval);

        socket.ws.on('close', () => {
            clearInterval(timer);
        });
    });
};
