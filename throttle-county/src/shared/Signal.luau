--!strict
-- Signal: the single same-machine event primitive. -- spec [30]
-- Handlers live in a linked list, so disconnecting during Fire is safe; each handler
-- runs in its own thread (a reused runner thread when free), so one error never
-- blocks the others. Never crosses the client-server boundary (that is Net).

export type Handler = (...any) -> ()

export type Connection = {
	Connected: boolean,
	Disconnect: (self: Connection) -> (),
	_signal: Signal?,
	_fn: Handler,
	_next: Connection?,
}

export type Signal = {
	Connect: (self: Signal, fn: Handler) -> Connection,
	Once: (self: Signal, fn: Handler) -> Connection,
	Wait: (self: Signal) -> ...any,
	Fire: (self: Signal, ...any) -> (),
	DisconnectAll: (self: Signal) -> (),
	Destroy: (self: Signal) -> (),
	_head: Connection?,
}

local freeRunnerThread: thread? = nil

local function acquireRunnerThreadAndCallHandler(fn: Handler, ...: any)
	local acquired = freeRunnerThread
	freeRunnerThread = nil
	fn(...)
	freeRunnerThread = acquired
end

local function runHandlerInFreeThread(fn: Handler, ...: any)
	acquireRunnerThreadAndCallHandler(fn, ...)
	while true do
		acquireRunnerThreadAndCallHandler(coroutine.yield())
	end
end

local function disconnect(self: Connection)
	if not self.Connected then
		return
	end
	self.Connected = false
	local signal = self._signal
	if signal == nil then
		return
	end
	if signal._head == self then
		signal._head = self._next
	else
		local prev = signal._head
		while prev ~= nil and prev._next ~= self do
			prev = prev._next
		end
		if prev ~= nil then
			prev._next = self._next
		end
	end
	-- keep _next so an in-progress Fire can continue walking the list
	self._signal = nil
end

local function connect(self: Signal, fn: Handler): Connection
	local connection: Connection = {
		Connected = true,
		Disconnect = disconnect,
		_signal = self,
		_fn = fn,
		_next = self._head,
	}
	self._head = connection
	return connection
end

local function once(self: Signal, fn: Handler): Connection
	local connection: Connection
	connection = connect(self, function(...: any)
		disconnect(connection)
		fn(...)
	end)
	return connection
end

local function waitFor(self: Signal): ...any
	local thread = coroutine.running()
	once(self, function(...: any)
		task.spawn(thread, ...)
	end)
	return coroutine.yield()
end

local function fire(self: Signal, ...: any)
	local item = self._head
	while item ~= nil do
		if item.Connected then
			if freeRunnerThread == nil then
				local runner = coroutine.create(runHandlerInFreeThread)
				freeRunnerThread = runner
			end
			task.spawn(freeRunnerThread :: thread, item._fn, ...)
		end
		item = item._next
	end
end

local function disconnectAll(self: Signal)
	local item = self._head
	while item ~= nil do
		item.Connected = false
		item._signal = nil
		item = item._next
	end
	self._head = nil
end

local Signal = {}

-- returns a new Signal
function Signal.new(): Signal
	local signal: Signal = {
		Connect = connect,
		Once = once,
		Wait = waitFor,
		Fire = fire,
		DisconnectAll = disconnectAll,
		Destroy = disconnectAll,
		_head = nil,
	}
	return signal
end

return table.freeze(Signal)
