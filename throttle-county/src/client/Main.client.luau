--!strict
-- Main (client): the only client LocalScript besides ReplicatedFirst/Loading. Waits for the
-- server, initializes Net, then boots the 12 Controllers in canonical order with per-module
-- isolation and fires Player_Ready. -- spec [25], [27], [45]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

if not game:IsLoaded() then
	game.Loaded:Wait()
end

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Net = require(Shared.Net)
local Types = require(Shared.Types)
local Game = require(Shared.Config.Game)

local log = Logger.new("Boot")

local CONTROLLER_ORDER = {
	"InputController",
	"VehicleController",
	"CameraController",
	"AudioController",
	"RiderAnimationController",
	"HUDController",
	"UIController",
	"PhoneController",
	"MapController",
	"WeatherFXController",
	"TrafficController",
	"SettingsController",
}

local SERVER_READY_WARN_INTERVAL_S = 10
local SERVER_READY_POLL_S = 0.1

type BootRecord = { Name: string, Module: Types.BootModule?, Failed: boolean }

local function waitForServerReady()
	if ReplicatedStorage:GetAttribute("ServerReady") == true then
		return
	end
	local ready = false
	local connection = ReplicatedStorage:GetAttributeChangedSignal("ServerReady"):Connect(function()
		ready = ReplicatedStorage:GetAttribute("ServerReady") == true
	end)
	local started = os.clock()
	local nextWarn = started + SERVER_READY_WARN_INTERVAL_S
	while not ready do
		task.wait(SERVER_READY_POLL_S)
		if os.clock() >= nextWarn then
			nextWarn += SERVER_READY_WARN_INTERVAL_S
			log:Warn("still waiting for ServerReady after %d s", math.floor(os.clock() - started))
		end
	end
	connection:Disconnect()
end

-- returns ok; logs one [Boot][ERROR] line on failure
local function runStep(name: string, step: string, fn: () -> ()): boolean
	local ok = true
	xpcall(fn, function(message: unknown)
		ok = false
		log:Error("%s:%s - %s", name, step, debug.traceback(tostring(message), 2))
	end)
	return ok
end

local function runInit(record: BootRecord, registry: Types.Registry): boolean
	local module = record.Module :: Types.BootModule
	local ok = true
	local started = os.clock()
	local thread = coroutine.create(function()
		ok = runStep(record.Name, "Init", function()
			module:Init(registry)
		end)
	end)
	coroutine.resume(thread)
	if coroutine.status(thread) ~= "dead" then
		log:Error("%s:Init yielded", record.Name)
		return false
	end
	if ok then
		log:Info("%s:Init OK (%.2f ms)", record.Name, (os.clock() - started) * 1000)
	end
	return ok
end

local function runStart(record: BootRecord)
	local module = record.Module :: Types.BootModule
	task.spawn(function()
		if runStep(record.Name, "Start", function()
			module:Start()
		end) then
			log:Info("%s:Start OK", record.Name)
		end
	end)
end

local function requireModule(name: string, container: Instance): Types.BootModule?
	local moduleScript = container:FindFirstChild(name)
	if moduleScript == nil or not moduleScript:IsA("ModuleScript") then
		log:Error("%s:require - ModuleScript not found in %s", name, container:GetFullName())
		return nil
	end
	local loaded: Types.BootModule? = nil
	runStep(name, "require", function()
		local result = require(moduleScript) :: any
		if type(result) ~= "table" or result.Name ~= name then
			error(string.format("module table must have Name = %q", name))
		end
		loaded = result
	end)
	return loaded
end

local function freezeRegistry(registry: Types.Registry): Types.Registry
	setmetatable(registry :: any, {
		__index = function(_: Types.Registry, key: string)
			error(string.format("registry has no module named %q", tostring(key)), 2)
		end,
	})
	return table.freeze(registry)
end

---------------------------------------------------------------------------
-- Boot sequence
---------------------------------------------------------------------------

local bootStart = os.clock()
waitForServerReady()
if not Net.InitClient() then
	log:Error("Net.InitClient failed; remotes are incomplete")
end

local controllersFolder = script.Parent:FindFirstChild("Controllers")
local records: { BootRecord } = {}
local registry: Types.Registry = {}

for _, name in CONTROLLER_ORDER do
	local module = if controllersFolder then requireModule(name, controllersFolder) else nil
	table.insert(records, { Name = name, Module = module, Failed = module == nil })
	if module ~= nil then
		registry[name] = module
	end
end
if controllersFolder == nil then
	log:Error("StarterPlayerScripts.Client.Controllers folder is missing")
end

local frozenRegistry = freezeRegistry(registry)

for _, record in records do
	if not record.Failed and not runInit(record, frozenRegistry) then
		record.Failed = true
	end
end

for _, record in records do
	if not record.Failed then
		runStart(record)
	end
end

if RunService:IsStudio() then
	local devTools = requireModule("DevToolsClient", script.Parent)
	if devTools ~= nil then
		local devRecord: BootRecord = { Name = "DevToolsClient", Module = devTools, Failed = false }
		if runInit(devRecord, frozenRegistry) then
			runStart(devRecord)
		end
	end
end

local failed: { string } = {}
for _, record in records do
	if record.Failed then
		table.insert(failed, record.Name)
	end
end
local okCount = #CONTROLLER_ORDER - #failed
if #failed == 0 then
	log:Info("%s client boot %d/%d OK in %d ms", Game.GAME_TITLE, okCount, #CONTROLLER_ORDER, math.floor((os.clock() - bootStart) * 1000 + 0.5))
else
	log:Error("Boot %d/%d, failed: %s", okCount, #CONTROLLER_ORDER, table.concat(failed, ", "))
end

Net.Fire("Player_Ready")
