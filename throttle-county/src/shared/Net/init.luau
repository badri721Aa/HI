--!strict
-- Net: the only client-server channel. Creates remotes from NetDefs on the server, validates
-- every incoming argument (Net.T) and rate-limits per player per remote before any handler runs.
-- -- spec [34], [35], [471]
-- Server API: Net.InitServer, Net.On, Net.OnInvoke, Net.Fire(name, player, ...), Net.FireAll,
--             Net.FireAllExcept, Net.FireNear, Net.Violation (Signal)
-- Client API: Net.InitClient, Net.Fire(name, ...), Net.On, Net.Invoke (nil, "timeout" after 10 s)
-- There is deliberately no InvokeClient path.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Logger = require(script.Parent.Logger)
local Signal = require(script.Parent.Signal)
local Types = require(script.Parent.Types)
local NetDefs = require(script.Parent.NetDefs)
local Validators = require(script.Validators)

local REMOTES_FOLDER_NAME = "Remotes"
local CLIENT_REMOTES_TIMEOUT_S = 30
local INVOKE_TIMEOUT_S = 10
local MAX_WARNS_PER_PLAYER_REMOTE = 3

-- violation weights -- spec [471]
local WEIGHT_TYPE = 3
local WEIGHT_RANGE = 2
local WEIGHT_RATE = 1

local IS_SERVER = RunService:IsServer()
local IS_STUDIO = RunService:IsStudio()

local log = Logger.new("Net")

export type Validator = Validators.Validator
type Bucket = { Tokens: number, Last: number }

local Net = {
	-- compiled validators per remote name; spec [35]
	T = {} :: { [string]: Validator },
	-- fired as (player, remoteName, reason, weight) for AntiCheatService; spec [35], [471]
	Violation = Signal.new(),
	Stats = { Delivered = 0, Rejected = 0 },
}

local events: { [string]: RemoteEvent } = {}
local unreliables: { [string]: UnreliableRemoteEvent } = {}
local functions: { [string]: RemoteFunction } = {}

local handlers: { [string]: (Player, ...any) -> () } = {}
local invokeHandlers: { [string]: (Player, ...any) -> unknown } = {}
local buckets: { [Player]: { [string]: Bucket } } = {}
local warnCounts: { [Player]: { [string]: number } } = {}

local initialized = false

local function compileAll()
	for name, def in NetDefs do
		Net.T[name] = Validators.compile(def)
	end
end

---------------------------------------------------------------------------
-- Shared helpers
---------------------------------------------------------------------------

-- returns the def for name, or nil (erroring in Studio) when it is not in NetDefs
local function getDef(name: string): Types.NetDef?
	local def = NetDefs[name]
	if def == nil then
		if IS_STUDIO then
			error(string.format("Net: '%s' is not defined in NetDefs", name), 3)
		end
		log:Error("'%s' is not defined in NetDefs", name)
		return nil
	end
	if def.StudioOnly and not IS_STUDIO then
		return nil
	end
	return def
end

---------------------------------------------------------------------------
-- Server
---------------------------------------------------------------------------

local function takeToken(player: Player, name: string, def: Types.NetDef): boolean
	local perPlayer = buckets[player]
	if perPlayer == nil then
		perPlayer = {}
		buckets[player] = perPlayer
	end
	local capacity = math.max(def.Rate, 1)
	local per = def.Per or 1
	local now = os.clock()
	local bucket = perPlayer[name]
	if bucket == nil then
		bucket = { Tokens = capacity, Last = now }
		perPlayer[name] = bucket
	end
	bucket.Tokens = math.min(capacity, bucket.Tokens + (now - bucket.Last) * capacity / per)
	bucket.Last = now
	if bucket.Tokens < 1 then
		return false
	end
	bucket.Tokens -= 1
	return true
end

local function reject(player: Player, name: string, failKind: string, reason: string)
	Net.Stats.Rejected += 1
	local counts = warnCounts[player]
	if counts == nil then
		counts = {}
		warnCounts[player] = counts
	end
	local n = (counts[name] or 0) + 1
	counts[name] = n
	if n <= MAX_WARNS_PER_PLAYER_REMOTE then
		log:Warn("[AC] %d %s %s", player.UserId, name, reason)
	end
	local weight = if failKind == "type" then WEIGHT_TYPE elseif failKind == "range" then WEIGHT_RANGE else WEIGHT_RATE
	Net.Violation:Fire(player, name, reason, weight)
end

-- returns true when the call passed rate limit and validation
local function admit(player: Player, name: string, def: Types.NetDef, ...: any): boolean
	if not takeToken(player, name, def) then
		reject(player, name, "rate", "rate limit")
		return false
	end
	local ok, failKind, reason = Net.T[name](...)
	if not ok then
		reject(player, name, failKind or "type", reason or "invalid")
		return false
	end
	return true
end

local function dispatchEvent(name: string, def: Types.NetDef, player: Player, ...: any): boolean
	if not admit(player, name, def, ...) then
		return false
	end
	local handler = handlers[name]
	if handler == nil then
		return false
	end
	Net.Stats.Delivered += 1
	xpcall(handler, function(message: unknown)
		log:Error("handler %s failed for %d: %s", name, player.UserId, debug.traceback(tostring(message), 2))
	end, player, ...)
	return true
end

local function dispatchInvoke(name: string, def: Types.NetDef, player: Player, ...: any): unknown
	if not admit(player, name, def, ...) then
		return nil
	end
	local handler = invokeHandlers[name]
	if handler == nil then
		return nil
	end
	Net.Stats.Delivered += 1
	local ok, result = xpcall(handler, debug.traceback, player, ...)
	if not ok then
		log:Error("invoke handler %s failed for %d: %s", name, player.UserId, tostring(result))
		return nil
	end
	return result
end

-- Creates every remote, then parents the Remotes folder last. Call once before Services bind.
function Net.InitServer()
	assert(IS_SERVER, "Net.InitServer is server-only")
	if initialized then
		return
	end
	initialized = true
	compileAll()
	local existing = ReplicatedStorage:FindFirstChild(REMOTES_FOLDER_NAME)
	if existing ~= nil then
		log:Warn("ReplicatedStorage.%s existed before boot and was replaced (never author it by hand)", REMOTES_FOLDER_NAME)
		existing:Destroy()
	end
	local folder = Instance.new("Folder")
	folder.Name = REMOTES_FOLDER_NAME
	for name, def in NetDefs do
		if def.StudioOnly and not IS_STUDIO then
			continue
		end
		local listens = def.Direction ~= "ToClient"
		if def.Kind == "Function" then
			local remote = Instance.new("RemoteFunction")
			remote.Name = name
			remote.OnServerInvoke = function(player: Player, ...: any): unknown
				return dispatchInvoke(name, def, player, ...)
			end
			remote.Parent = folder
			functions[name] = remote
		elseif def.Kind == "Unreliable" then
			local remote = Instance.new("UnreliableRemoteEvent")
			remote.Name = name
			if listens then
				-- lifetime: server
				remote.OnServerEvent:Connect(function(player: Player, ...: any)
					dispatchEvent(name, def, player, ...)
				end)
			end
			remote.Parent = folder
			unreliables[name] = remote
		else
			local remote = Instance.new("RemoteEvent")
			remote.Name = name
			if listens then
				-- lifetime: server
				remote.OnServerEvent:Connect(function(player: Player, ...: any)
					dispatchEvent(name, def, player, ...)
				end)
			end
			remote.Parent = folder
			events[name] = remote
		end
	end
	-- lifetime: server
	Players.PlayerRemoving:Connect(function(player: Player)
		buckets[player] = nil
		warnCounts[player] = nil
	end)
	folder.Parent = ReplicatedStorage
end

-- Server: binds the single handler for a ToServer event; Client: connects to a ToClient event.
-- returns the client connection (nil on the server)
function Net.On(name: string, handler: (...any) -> ()): RBXScriptConnection?
	local def = getDef(name)
	if def == nil then
		return nil
	end
	if IS_SERVER then
		if def.Direction == "ToClient" or def.Kind == "Function" then
			log:Error("Net.On('%s'): not a client-to-server event", name)
			return nil
		end
		if handlers[name] ~= nil then
			log:Error("Net.On('%s'): a handler is already bound", name)
			return nil
		end
		handlers[name] = handler
		return nil
	end
	if def.Direction == "ToServer" then
		log:Error("Net.On('%s'): not a server-to-client remote", name)
		return nil
	end
	local unreliable: UnreliableRemoteEvent? = unreliables[name]
	if unreliable ~= nil then
		return unreliable.OnClientEvent:Connect(handler)
	end
	local event: RemoteEvent? = events[name]
	if event ~= nil then
		return event.OnClientEvent:Connect(handler)
	end
	log:Error("Net.On('%s'): remote missing (InitClient not run?)", name)
	return nil
end

-- Server only: binds the handler for a RemoteFunction; its single return value goes to the client
function Net.OnInvoke(name: string, handler: (Player, ...any) -> unknown)
	assert(IS_SERVER, "Net.OnInvoke is server-only")
	local def = getDef(name)
	if def == nil then
		return
	end
	if def.Kind ~= "Function" then
		log:Error("Net.OnInvoke('%s'): not a RemoteFunction", name)
		return
	end
	if invokeHandlers[name] ~= nil then
		log:Error("Net.OnInvoke('%s'): a handler is already bound", name)
		return
	end
	invokeHandlers[name] = handler
end

local function fireClient(name: string, player: Player, ...: any)
	local unreliable: UnreliableRemoteEvent? = unreliables[name]
	if unreliable ~= nil then
		unreliable:FireClient(player, ...)
		return
	end
	local event: RemoteEvent? = events[name]
	if event ~= nil then
		event:FireClient(player, ...)
	end
end

-- Server: Fire(name, player, ...) to one client. Client: Fire(name, ...) to the server.
function Net.Fire(name: string, ...: any)
	local def = getDef(name)
	if def == nil then
		return
	end
	if IS_SERVER then
		if def.Direction == "ToServer" then
			log:Error("Net.Fire('%s'): not a server-to-client remote", name)
			return
		end
		local player = (select(1, ...))
		if typeof(player) ~= "Instance" or not (player :: Instance):IsA("Player") then
			log:Error("Net.Fire('%s'): first argument must be a Player", name)
			return
		end
		fireClient(name, player :: Player, select(2, ...))
		return
	end
	if def.Direction == "ToClient" or def.Kind == "Function" then
		log:Error("Net.Fire('%s'): not a client-to-server event", name)
		return
	end
	local unreliable: UnreliableRemoteEvent? = unreliables[name]
	if unreliable ~= nil then
		unreliable:FireServer(...)
		return
	end
	local event: RemoteEvent? = events[name]
	if event ~= nil then
		event:FireServer(...)
		return
	end
	log:Error("Net.Fire('%s'): remote missing (InitClient not run?)", name)
end

-- Server only: fires to every player
function Net.FireAll(name: string, ...: any)
	assert(IS_SERVER, "Net.FireAll is server-only")
	local def = getDef(name)
	if def == nil or def.Direction == "ToServer" then
		return
	end
	local unreliable: UnreliableRemoteEvent? = unreliables[name]
	if unreliable ~= nil then
		unreliable:FireAllClients(...)
		return
	end
	local event: RemoteEvent? = events[name]
	if event ~= nil then
		event:FireAllClients(...)
	end
end

-- Server only: fires to every player except one
function Net.FireAllExcept(name: string, except: Player, ...: any)
	assert(IS_SERVER, "Net.FireAllExcept is server-only")
	local def = getDef(name)
	if def == nil or def.Direction == "ToServer" then
		return
	end
	for _, player in Players:GetPlayers() do
		if player ~= except then
			fireClient(name, player, ...)
		end
	end
end

-- Server only: fires to players whose character root is within radius studs of position
function Net.FireNear(name: string, position: Vector3, radius: number, ...: any)
	assert(IS_SERVER, "Net.FireNear is server-only")
	local def = getDef(name)
	if def == nil or def.Direction == "ToServer" then
		return
	end
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local root = if character then character.PrimaryPart else nil
		if root ~= nil and (root.Position - position).Magnitude <= radius then
			fireClient(name, player, ...)
		end
	end
end

-- Server only (DevTools /fuzz): validates an incoming call with Net.T and reaches the bound
-- handler only if it passes. Skips rate limits and violation logging so fuzzing stays quiet.
-- returns true if a handler was reached
function Net.SimulateIncoming(player: Player, name: string, ...: any): boolean
	assert(IS_SERVER, "Net.SimulateIncoming is server-only")
	local def = NetDefs[name]
	if def == nil or def.Direction == "ToClient" then
		return false
	end
	local ok = Net.T[name](...)
	if not ok then
		Net.Stats.Rejected += 1
		return false
	end
	if def.Kind == "Function" then
		local handler = invokeHandlers[name]
		if handler == nil then
			return false
		end
		Net.Stats.Delivered += 1
		handler(player, ...)
		return true
	end
	local handler = handlers[name]
	if handler == nil then
		return false
	end
	Net.Stats.Delivered += 1
	handler(player, ...)
	return true
end

---------------------------------------------------------------------------
-- Client
---------------------------------------------------------------------------

-- Waits up to 30 s for ReplicatedStorage.Remotes and verifies every NetDefs entry.
-- returns true when all remotes were found
function Net.InitClient(): boolean
	assert(not IS_SERVER, "Net.InitClient is client-only")
	if initialized then
		return true
	end
	compileAll()
	local folder = ReplicatedStorage:WaitForChild(REMOTES_FOLDER_NAME, CLIENT_REMOTES_TIMEOUT_S)
	if folder == nil then
		log:Error("ReplicatedStorage.%s did not appear within %d s", REMOTES_FOLDER_NAME, CLIENT_REMOTES_TIMEOUT_S)
		return false
	end
	local missing = 0
	for name, def in NetDefs do
		if def.StudioOnly and not IS_STUDIO then
			continue
		end
		local remote = folder:FindFirstChild(name)
		if remote == nil then
			missing += 1
			log:Error("remote %s missing from ReplicatedStorage.Remotes", name)
		elseif remote:IsA("RemoteFunction") then
			functions[name] = remote
		elseif remote:IsA("UnreliableRemoteEvent") then
			unreliables[name] = remote
		elseif remote:IsA("RemoteEvent") then
			events[name] = remote
		end
	end
	initialized = true
	return missing == 0
end

-- Client only: invokes a RemoteFunction; yields up to 10 s.
-- returns (result, nil) or (nil, "timeout" | "error")
function Net.Invoke(name: string, ...: any): (unknown, string?)
	assert(not IS_SERVER, "Net.Invoke is client-only")
	local def = getDef(name)
	if def == nil then
		return nil, "error"
	end
	local remote: RemoteFunction? = functions[name]
	if remote == nil then
		log:Error("Net.Invoke('%s'): remote missing (InitClient not run?)", name)
		return nil, "error"
	end
	local caller = coroutine.running()
	local finished = false
	task.spawn(function(...: any)
		local ok, result = pcall(remote.InvokeServer, remote, ...)
		if finished then
			return
		end
		finished = true
		if ok then
			task.spawn(caller, result, nil)
		else
			log:Warn("Net.Invoke('%s') failed: %s", name, tostring(result))
			task.spawn(caller, nil, "error")
		end
	end, ...)
	task.delay(INVOKE_TIMEOUT_S, function()
		if finished then
			return
		end
		finished = true
		task.spawn(caller, nil, "timeout")
	end)
	return coroutine.yield()
end

return Net
