package emit

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

type Socket struct {
	ID              string
	conn            *websocket.Conn
	app             *App
	rooms           sync.Map
	tags            sync.Map
	data            sync.Map
	sendChan        chan Message
	pendingRequests sync.Map
	ctx             context.Context
	cancel          context.CancelFunc
	info            *http.Request
}

func newSocket(conn *websocket.Conn, app *App, req *http.Request) *Socket {
	ctx, cancel := context.WithCancel(app.ctx)

	return &Socket{
		ID:       uuid.New().String(),
		conn:     conn,
		app:      app,
		sendChan: make(chan Message, 256),
		ctx:      ctx,
		cancel:   cancel,
		info:     req,
	}
}

func (s *Socket) readPump() {
	defer s.disconnect()

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
			_, data, err := s.conn.Read(s.ctx)
			if err != nil {
				return
			}

			var msg Message
			if err := json.Unmarshal(data, &msg); err != nil {
				s.handleError(err, nil)
				continue
			}

			go s.handleMessage(&msg)
		}
	}
}

func (s *Socket) writePump() {
	defer s.disconnect()

	for {
		select {
		case <-s.ctx.Done():
			return
		case msg := <-s.sendChan:
			data, err := json.Marshal(msg)
			if err != nil {
				log.Printf("Failed to marshal message: %v", err)
				continue
			}

			if err := s.conn.Write(s.ctx, websocket.MessageText, data); err != nil {
				return
			}

		}
	}
}

func (s *Socket) handleMessage(msg *Message) {

	if msg.Type == "ack" {
		if pending, ok := s.pendingRequests.Load(msg.AckID); ok {
			pr := pending.(*pendingRequest)
			pr.timer.Stop()
			pr.replyChan <- msg.Data
			s.pendingRequests.Delete(msg.AckID)
		}

		return
	}

	req := &Request{
		Event:  msg.Event,
		Data:   msg.Data,
		Socket: s,
		App:    s.app,
		ackID:  msg.AckID,
		ctx:    s.ctx,
	}

	s.runMiddleware(s.app.middleware, req, func() error {
		if entry, ok := s.app.handlers.Load("@any"); ok {
			entry.(*handlerEntry).handler(req)
		}

		if entry, ok := s.app.handlers.Load(msg.Event); ok {
			he := entry.(*handlerEntry)

			return s.runMiddleware(he.middleware, req, func() error {
				return he.handler(req)
			})
		}

		if msg.AckID != "" {
			req.Reply(map[string]any{"error": fmt.Sprintf("No handler for %s", msg.Event)})
		} else if _, ok := s.app.handlers.Load("@any"); !ok {
			log.Printf("No handler for %s", msg.Event)
		}
		return nil
	})
}

func (s *Socket) runMiddleware(middleware []MiddlewareFunc, req *Request, done func() error) error {
	if len(middleware) == 0 {
		return done()
	}

	var run func(int) error
	run = func(i int) error {
		if i >= len(middleware) {
			return done()
		}

		return middleware[i](req, func() error {
			return run(i + 1)
		})
	}

	return run(0)
}

func (s *Socket) emit(msg Message) {
	select {
	case s.sendChan <- msg:
	case <-s.ctx.Done():
	}
}

func (s *Socket) Emit(event string, data map[string]any) {
	s.emit(Message{Event: event, Data: data})
}

func (s *Socket) Request(event string, data map[string]any, timeout time.Duration) (map[string]any, error) {
	if timeout == 0 {
		timeout = 10 * time.Second
	}

	ackID := uuid.New().String()
	replyChan := make(chan map[string]any, 1)

	timer := time.AfterFunc(timeout, func() {
		s.pendingRequests.Delete(ackID)
		close(replyChan)
	})

	s.pendingRequests.Store(ackID, &pendingRequest{
		replyChan: replyChan,
		timer:     timer,
	})

	s.emit(Message{
		Event: event,
		Data:  data,
		AckID: ackID,
	})

	reply, ok := <-replyChan
	if !ok {
		return nil, fmt.Errorf("request timeout: %s", event)
	}

	return reply, nil

}

func (s *Socket) Join(room string) *Socket {
	if room[0] != '#' {
		room = "#" + room
	}

	s.rooms.Store(room, true)
	s.app.joinRoom(room, s)
	return s
}

func (s *Socket) Leave(room string) *Socket {
	if room[0] != '#' {
		room = "#" + room
	}

	s.rooms.Delete(room)
	s.app.leaveRoom(room, s)
	return s
}

func (s *Socket) Tag(name string) *Socket {
	if name[0] != '*' {
		name = "*" + name
	}

	s.tags.Store(name, true)
	return s
}

func (s *Socket) Untag(name string) *Socket {
	if name[0] != '*' {
		name = "*" + name
	}

	s.tags.Delete(name)
	return s

}

func (s *Socket) HasTag(name string) bool {
	if name[0] != '*' {
		name = "*" + name
	}

	_, ok := s.tags.Load(name)
	return ok
}

func (s *Socket) disconnect() {
	s.cancel()
	s.conn.Close(websocket.StatusNormalClosure, "")

	s.rooms.Range(func(key, _ any) bool {
		s.Leave(key.(string))
		return true
	})

	s.app.sockets.Delete(s.ID)

	if entry, ok := s.app.handlers.Load("@disconnect"); ok {
		req := &Request{
			Event:  "@disconnect",
			Socket: s,
			App:    s.app,
			ctx:    s.ctx,
		}
		entry.(*handlerEntry).handler(req)
	}
}

func (s *Socket) handleError(err error, req *Request) {
	if entry, ok := s.app.handlers.Load("@error"); ok {
		if req == nil {
			req = &Request{
				Socket: s,
				App:    s.app,
				ctx:    s.ctx,
			}
			entry.(*handlerEntry).handler(req)
		} else {
			log.Printf("Error: %v", err)
		}
	}
}
