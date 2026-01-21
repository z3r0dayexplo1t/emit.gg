package main

import (
	"log"

	"github.com/z3r0dayexplo1t/emit.gg-go/emit"
)

func main() {
	app := emit.New()

	// Logging middleware
	app.Use(func(req *emit.Request, next emit.NextFunc) error {
		log.Printf("[%s] %s", req.Socket.ID[:8], req.Event)
		return next()
	})

	// Connection handler
	app.On("@connection", func(req *emit.Request) error {
		log.Printf("Client connected: %s", req.Socket.ID)
		return nil
	})

	// Ping handler
	app.On("ping", func(req *emit.Request) error {
		return req.Reply(map[string]any{"message": "pong"})
	})

	// Chat namespace
	chat := app.Namespace("/chat:")

	chat.On("join", func(req *emit.Request) error {
		username := req.Data["username"].(string)
		req.Set("username", username)
		req.Join("lobby")
		req.Broadcast("user:joined", map[string]any{
			"username": username,
		}, "#lobby")
		return nil
	})

	chat.On("message", func(req *emit.Request) error {
		username, _ := req.Get("username")
		req.Broadcast("message", map[string]any{
			"username": username,
			"message":  req.Data["message"],
		}, "#lobby")
		return nil
	})

	// Disconnect handler
	app.On("@disconnect", func(req *emit.Request) error {
		log.Printf("Client disconnected: %s", req.Socket.ID)
		return nil
	})

	// Error handler
	app.On("@error", func(req *emit.Request) error {
		log.Printf("Error: %v", req.Data)
		return nil
	})

	log.Fatal(app.Listen(":8080"))
}
