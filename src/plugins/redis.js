/**
 * Redis Adapter Plugin
 * Enables horizontal scaling via Redis pub/sub
 *
 * Usage:
 *   const Redis = require('ioredis');
 *   const pub = new Redis();
 *   const sub = new Redis();
 *
 *   app.plugin(redisAdapter({ pub, sub }));
 */

module.exports = ({ pub, sub, channel = 'emit.gg' } = {}) => {
    if (!pub || !sub) {
        throw new Error('Redis adapter requires pub and sub clients');
    }

    return (app) => {
        const instanceId = Math.random().toString(36).slice(2, 10);

        // Subscribe to channel
        sub.subscribe(channel);

        sub.on('message', (ch, raw) => {
            if (ch !== channel) return;

            try {
                const message = JSON.parse(raw);

                // Ignore own messages
                if (message._instance === instanceId) return;

                const { event, data, to } = message;

                // Local broadcast only (don't re-publish)
                let targets;
                if (to && to.startsWith('#')) {
                    targets = app.rooms.get(to) || new Set();
                } else {
                    targets = app.sockets;
                }

                targets.forEach(socket => socket.emit(event, data));
            } catch (err) {
                // Ignore malformed messages
            }
        });

        // Override broadcast to publish to Redis
        const originalBroadcast = app.broadcast.bind(app);

        app.broadcast = (event, options = {}) => {
            const { data = {}, to, local = false } = options;

            // Always do local broadcast
            originalBroadcast(event, { data, to });

            // Publish to Redis unless local-only
            if (!local) {
                pub.publish(channel, JSON.stringify({
                    _instance: instanceId,
                    event,
                    data,
                    to
                }));
            }

            return app;
        };

        // Cleanup on close
        const originalClose = app.close.bind(app);

        app.close = async () => {
            sub.unsubscribe(channel);
            return originalClose();
        };
    };
};
