/**
 * Heartbeat Plugin
 * Keeps connections alive with ping/pong
 */
module.exports = ({ interval = 30000 } = {}) => {
    return (app) => {
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
};
