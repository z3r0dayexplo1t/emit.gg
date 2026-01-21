package emit

type Namespace struct {
	app    *App
	prefix string
}

func (ns *Namespace) On(event string, args ...any) *Namespace {
	handler, ok := args[len(args)-1].(func(*Request) error)
	if !ok {
		return ns
	}
	var middleware []MiddlewareFunc

	if len(args) > 1 {
		for _, m := range args[:len(args)-1] {
			middleware = append(middleware, m.(MiddlewareFunc))
		}
	}

	ns.app.handlers.Store(ns.prefix+event, &handlerEntry{
		handler:    handler,
		middleware: middleware,
	})

	return ns
}

func (ns *Namespace) Namespace(prefix string) *Namespace {
	return &Namespace{
		app:    ns.app,
		prefix: ns.prefix + prefix,
	}
}
