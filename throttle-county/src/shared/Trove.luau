--!strict
-- Trove: owns cleanup of connections, instances, functions, threads and objects. -- spec [31]
-- Cleanup runs in reverse insertion order and dispatches on the tracked value's type.

local Signal = require(script.Parent.Signal)

type Entry = { Object: unknown, Method: string? }

export type Trove = {
	Add: <T>(self: Trove, object: T, method: string?) -> T,
	Connect: (self: Trove, signal: RBXScriptSignal | Signal.Signal, fn: (...any) -> ()) -> unknown,
	Clone: (self: Trove, instance: Instance) -> Instance,
	Extend: (self: Trove) -> Trove,
	Remove: (self: Trove, object: unknown) -> boolean,
	Clean: (self: Trove) -> (),
	Destroy: (self: Trove) -> (),
	_entries: { Entry },
	_cleaning: boolean,
}

local function cleanupObject(object: unknown, method: string?)
	local kind = typeof(object)
	if kind == "RBXScriptConnection" then
		(object :: RBXScriptConnection):Disconnect()
	elseif kind == "Instance" then
		(object :: Instance):Destroy()
	elseif kind == "function" then
		(object :: () -> ())()
	elseif kind == "thread" then
		local thread = object :: thread
		if coroutine.status(thread) ~= "dead" then
			pcall(task.cancel, thread)
		end
	elseif kind == "table" then
		local tbl = object :: { [string]: unknown }
		local fn = tbl[method or "Destroy"]
		if type(fn) == "function" then
			(fn :: (unknown) -> ())(tbl)
		else
			local disconnectFn = tbl.Disconnect
			if type(disconnectFn) == "function" then
				(disconnectFn :: (unknown) -> ())(tbl)
			end
		end
	end
end

local Trove = {}

local function add<T>(self: Trove, object: T, method: string?): T
	if self._cleaning then
		error("Trove:Add called while cleaning", 2)
	end
	table.insert(self._entries, { Object = object, Method = method })
	return object
end

local function connectSignal(self: Trove, signal: RBXScriptSignal | Signal.Signal, fn: (...any) -> ()): unknown
	if typeof(signal) == "RBXScriptSignal" then
		local connection = (signal :: RBXScriptSignal):Connect(fn)
		add(self, connection)
		return connection
	end
	local connection = (signal :: Signal.Signal):Connect(fn)
	add(self, connection)
	return connection
end

local function cloneInstance(self: Trove, instance: Instance): Instance
	local copy = instance:Clone()
	add(self, copy)
	return copy
end

local function remove(self: Trove, object: unknown): boolean
	local entries = self._entries
	for i = #entries, 1, -1 do
		local entry = entries[i]
		if entry.Object == object then
			table.remove(entries, i)
			cleanupObject(entry.Object, entry.Method)
			return true
		end
	end
	return false
end

local function clean(self: Trove)
	if self._cleaning then
		return
	end
	self._cleaning = true
	local entries = self._entries
	while #entries > 0 do
		local entry = table.remove(entries) :: Entry
		cleanupObject(entry.Object, entry.Method)
	end
	self._cleaning = false
end

local function extend(self: Trove): Trove
	local child = Trove.new()
	add(self, child, "Destroy")
	return child
end

-- returns a new, empty Trove
function Trove.new(): Trove
	local trove: Trove = {
		Add = add,
		Connect = connectSignal,
		Clone = cloneInstance,
		Extend = extend,
		Remove = remove,
		Clean = clean,
		Destroy = clean,
		_entries = {},
		_cleaning = false,
	}
	return trove
end

return table.freeze(Trove)
