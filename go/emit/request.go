package emit

import "context"

type Request struct {
	Event  string
	Data   map[string]any
	Socket *Socket
	App    *App
	ackID  string
	ctx    context.Context
}

func (r *Request) Reply(data map[string]any) error {
	if r.ackID == "" {
		return nil
	}
	r.Socket.emit(Message{
		Type:  "ack",
		AckID: r.ackID,
		Data:  data,
	})

	return nil
}

func (r *Request) Emit(event string, data map[string]any) {
	r.Socket.Emit(event, data)
}

func (r *Request) Set(key string, value any) {
	r.Socket.data.Store(key, value)
}

func (r *Request) Get(key string) (any, bool) {
	return r.Socket.data.Load(key)
}

func (r *Request) Join(room string) {
	r.Socket.Join(room)
}

func (r *Request) Leave(room string) {
	r.Socket.Leave(room)
}
func (r *Request) Tag(name string) {
	r.Socket.Tag(name)
}
func (r *Request) Untag(name string) {
	r.Socket.Untag(name)
}
func (r *Request) Broadcast(event string, data map[string]any, to string) {
	r.App.Broadcast(event, data, to)
}
