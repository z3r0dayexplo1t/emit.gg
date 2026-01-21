package emit

import (
	"context"
	"log"
	"net/http"
	"sync"

	"github.com/coder/websocket"
)

type App struct {
	handlers   sync.Map
	rooms      sync.Map
	sockets    sync.Map
	middleware []MiddlewareFunc
	server     *http.Server
	ctx        context.Context
	cancel     context.CancelFunc
}

func New() *App {
	ctx, cancel := context.WithCancel(context.Background())
	return &App{
		ctx:    ctx,
		cancel: cancel,
	}
}

func (a *App) Use(fn MiddlewareFunc) *App {
	a.middleware = append(a.middleware, fn)
	return a
}

func (a *App) On(event string, args ...any) *App {
	if len(args) == 0 {
		return a
	}

	handler, ok := args[len(args)-1].(func(*Request) error)
	if !ok {
		return a
	}
	var middleware []MiddlewareFunc

	if len(args) > 1 {
		for _, m := range args[:len(args)-1] {
			middleware = append(middleware, m.(MiddlewareFunc))
		}
	}

	a.handlers.Store(event, &handlerEntry{
		handler:    handler,
		middleware: middleware,
	})

	return a
}

func (a *App) Namespace(prefix string) *Namespace {
	return &Namespace{
		app:    a,
		prefix: prefix,
	}
}

func (a *App) Broadcast(event string, data map[string]any, to string) {
	var targets []*Socket

	if to != "" {
		if to[0] == '#' {
			if roomMap, ok := a.rooms.Load(to); ok {
				rm := roomMap.(*sync.Map)
				rm.Range(func(key, _ any) bool {
					if socket, ok := a.sockets.Load(key); ok {
						targets = append(targets, socket.(*Socket))
					}
					return true
				})
			}
		} else if to[0] == '*' {
			a.sockets.Range(func(_, value any) bool {
				socket := value.(*Socket)
				if socket.HasTag(to) {
					targets = append(targets, socket)
				}
				return true
			})
		} else {
			a.sockets.Range(func(_, value any) bool {
				targets = append(targets, value.(*Socket))
				return true
			})
		}

		msg := Message{
			Event: event,
			Data:  data,
		}
		for _, socket := range targets {
			socket.emit(msg)
		}
	}
}

func (a *App) GetSocket(socketID string) *Socket {
	if socket, ok := a.sockets.Load(socketID); ok {
		return socket.(*Socket)
	}
	return nil
}

func (a *App) Listen(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", a.handleWebSocket)
	a.server = &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	log.Printf("emit.gg server listening on %s", addr)
	return a.server.ListenAndServe()
}

func (a *App) Close() error {
	a.cancel()
	if a.server != nil {
		return a.server.Shutdown(context.Background())
	}
	return nil
}

func (a *App) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})

	if err != nil {
		log.Printf("Failed to accept websocket: %v", err)
		return
	}

	socket := newSocket(conn, a, r)
	a.sockets.Store(socket.ID, socket)

	if entry, ok := a.handlers.Load("@connection"); ok {
		req := &Request{
			Event:  "@connection",
			Socket: socket,
			App:    a,
			ctx:    socket.ctx,
		}
		entry.(*handlerEntry).handler(req)
	}

	go socket.readPump()
	go socket.writePump()
}

func (a *App) joinRoom(room string, socket *Socket) {
	roomMap, _ := a.rooms.LoadOrStore(room, &sync.Map{})
	roomMap.(*sync.Map).Store(socket.ID, true)
}

func (a *App) leaveRoom(room string, socket *Socket) {
	if roomMap, ok := a.rooms.Load(room); ok {
		rm := roomMap.(*sync.Map)
		rm.Delete(socket.ID)
	}
}
