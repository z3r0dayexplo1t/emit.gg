package emit

import "time"

type HanddlerFunc func(*Request) error
type MiddlewareFunc func(*Request, NextFunc) error
type NextFunc func() error

type Message struct {
	Type  string         `json:"type"`
	Event string         `json:"event"`
	Data  map[string]any `json:"data"`
	AckID string         `json:"ackId"`
}

type handlerEntry struct {
	handler    HandlerFunc
	middleware []MiddlewareFunc
}

type pendingRequest struct {
	replyChan chan map[string]any
	timer     *time.Timer
}
