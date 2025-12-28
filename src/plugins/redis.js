/**
 * Redis Adapter Plugin
 * Enables horizontal scaling via Redis pub/sub
 *
 * Features:
 *   - Cross-server broadcasts
 *   - Room membership sync
 *   - Direct messaging to specific sockets
 *   - User presence tracking
 *   - Tags sync
 *
 * Usage:
 *   const Redis = require('ioredis');
 *   const redis = new Redis();
 *   const pub = new Redis();
 *   const sub = new Redis();
 *
 *   app.plugin(redisAdapter({ redis, pub, sub }));
 */

module.exports = ({ redis, pub, sub, prefix = 'emit.gg', channel = 'emit.gg' } = {}) => {
    if (!pub || !sub) {
        throw new Error('Redis adapter requires pub and sub clients');
    }

    return (app) => {
        const instanceId = Math.random().toString(36).slice(2, 10);

        // ============ SUBSCRIBE TO REDIS ============

        sub.subscribe(channel);
        sub.subscribe(`${channel}:direct`);

        sub.on('message', async (ch, raw) => {
            try {
                const message = JSON.parse(raw);

                // Ignore own messages
                if (message._instance === instanceId) return;

                if (ch === `${channel}:direct`) {
                    // Direct message to specific socket
                    const { targetSocketId, event, data } = message;
                    const socket = [...app.sockets].find(s => s.id === targetSocketId);
                    if (socket) {
                        socket.emit(event, data);
                    }
                } else if (ch === channel) {
                    // Broadcast
                    const { event, data, to } = message;

                    let targets;
                    if (to && to.startsWith('#')) {
                        targets = app.rooms.get(to) || new Set();
                    } else if (to && to.startsWith('*')) {
                        targets = new Set();
                        app.sockets.forEach(socket => {
                            if (socket.hasTag(to)) targets.add(socket);
                        });
                    } else {
                        targets = app.sockets;
                    }

                    targets.forEach(socket => socket.emit(event, data));
                }
            } catch (err) {
                // Ignore malformed messages
            }
        });

        // ============ OVERRIDE BROADCAST ============

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

        // ============ DIRECT MESSAGING ============

        const originalEmitTo = app.emitTo.bind(app);

        app.emitTo = (socketId, event, data) => {
            // Try local first using the base implementation (O(1) lookup)
            const localSocket = app.socketMap.get(socketId);
            if (localSocket) {
                localSocket.emit(event, data);
                return app;
            }

            // Socket not local - publish to Redis for other servers
            pub.publish(`${channel}:direct`, JSON.stringify({
                _instance: instanceId,
                targetSocketId: socketId,
                event,
                data
            }));

            return app;
        };

        // ============ ROOM SYNC ============

        if (redis) {
            // Override join to sync to Redis
            const originalJoin = app.constructor.prototype._joinRoom;

            app._joinRoom = (room, socket) => {
                originalJoin.call(app, room, socket);
                redis.sadd(`${prefix}:room:${room}`, socket.id);
                redis.expire(`${prefix}:room:${room}`, 86400); // 24h TTL
            };

            // Override leave to sync to Redis
            const originalLeave = app.constructor.prototype._leaveRoom;

            app._leaveRoom = (room, socket) => {
                originalLeave.call(app, room, socket);
                redis.srem(`${prefix}:room:${room}`, socket.id);
            };

            // Get room size across all servers
            app.getRoomSize = async (room) => {
                if (!room.startsWith('#')) room = '#' + room;
                return redis.scard(`${prefix}:room:${room}`);
            };

            // Get room members across all servers
            app.getRoomMembers = async (room) => {
                if (!room.startsWith('#')) room = '#' + room;
                return redis.smembers(`${prefix}:room:${room}`);
            };
        }

        // ============ PRESENCE TRACKING ============

        if (redis) {
            // Track socket on connect
            const originalHandleConnection = app._handleConnection.bind(app);

            app._handleConnection = (ws, req) => {
                originalHandleConnection(ws, req);

                // Get the socket that was just created
                const socket = [...app.sockets].find(s => s.ws === ws);
                if (socket) {
                    redis.hset(`${prefix}:sockets`, socket.id, JSON.stringify({
                        server: instanceId,
                        connectedAt: Date.now()
                    }));
                }
            };

            // Remove socket on disconnect (hook into socket close)
            const originalSocketClose = app.handlers.get('@disconnect');

            app.on('@disconnect', (req) => {
                redis.hdel(`${prefix}:sockets`, req.socket.id);
                redis.srem(`${prefix}:room:*`, req.socket.id); // Cleanup rooms

                // Call original handler if exists
                if (originalSocketClose) {
                    originalSocketClose.handler(req);
                }
            });

            // Get total connected sockets across all servers
            app.getTotalSockets = async () => {
                return redis.hlen(`${prefix}:sockets`);
            };

            // Check if socket exists anywhere
            app.socketExists = async (socketId) => {
                const exists = await redis.hexists(`${prefix}:sockets`, socketId);
                return exists === 1;
            };

            // Get all socket IDs
            app.getAllSocketIds = async () => {
                return redis.hkeys(`${prefix}:sockets`);
            };
        }

        // ============ USER PRESENCE ============

        if (redis) {
            // Set user as online
            app.setUserOnline = async (userId, socketId) => {
                await redis.hset(`${prefix}:users`, odId, JSON.stringify({
                    socketId,
                    server: instanceId,
                    onlineAt: Date.now()
                }));
            };

            // Set user as offline
            app.setUserOffline = async (userId) => {
                await redis.hdel(`${prefix}:users`, odId);
            };

            // Check if user is online
            app.isUserOnline = async (userId) => {
                const exists = await redis.hexists(`${prefix}:users`, odId);
                return exists === 1;
            };

            // Get user's socket ID (for direct messaging)
            app.getUserSocketId = async (userId) => {
                const data = await redis.hget(`${prefix}:users`, odId);
                if (data) {
                    return JSON.parse(data).socketId;
                }
                return null;
            };

            // Emit to user by ID
            app.emitToUser = async (userId, event, data) => {
                const socketId = await app.getUserSocketId(userId);
                if (socketId) {
                    app.emitTo(socketId, event, data);
                }
            };

            // Get online user count
            app.getOnlineUserCount = async () => {
                return redis.hlen(`${prefix}:users`);
            };

            // Get all online user IDs
            app.getOnlineUsers = async () => {
                return redis.hkeys(`${prefix}:users`);
            };
        }

        // ============ TAGS SYNC ============

        if (redis) {
            // Track tags in Redis
            app.syncTag = async (socketId, tag) => {
                if (!tag.startsWith('*')) tag = '*' + tag;
                await redis.sadd(`${prefix}:tag:${tag}`, socketId);
                await redis.expire(`${prefix}:tag:${tag}`, 86400);
            };

            app.unsyncTag = async (socketId, tag) => {
                if (!tag.startsWith('*')) tag = '*' + tag;
                await redis.srem(`${prefix}:tag:${tag}`, socketId);
            };

            // Get sockets with tag across all servers
            app.getTaggedSockets = async (tag) => {
                if (!tag.startsWith('*')) tag = '*' + tag;
                return redis.smembers(`${prefix}:tag:${tag}`);
            };

            // Get tag count across all servers
            app.getTagCount = async (tag) => {
                if (!tag.startsWith('*')) tag = '*' + tag;
                return redis.scard(`${prefix}:tag:${tag}`);
            };
        }

        // ============ CLEANUP ============

        const originalClose = app.close.bind(app);

        app.close = async () => {
            sub.unsubscribe(channel);
            sub.unsubscribe(`${channel}:direct`);

            // Cleanup this server's sockets from Redis
            if (redis) {
                for (const socket of app.sockets) {
                    await redis.hdel(`${prefix}:sockets`, socket.id);
                }
            }

            return originalClose();
        };
    };
};
