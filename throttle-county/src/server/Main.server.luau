--!strict
-- Main (server): the only server Script. Boots Logger, settings check, ConfigValidator, Net,
-- then the 17 Services in canonical order with per-module isolation. -- spec [21], [24], [27], [45]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local StarterPlayer = game:GetService("StarterPlayer")
local Lighting = game:GetService("Lighting")

local bootStart = os.clock()

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Types = require(Shared.Types)
local Net = require(Shared.Net)
local Game = require(Shared.Config.Game)
local AssetIds = require(Shared.Config.AssetIds)
local SoundIds = require(Shared.Config.SoundIds)

local log = Logger.new("Boot")

local SERVICE_ORDER = {
	"DataService",
	"PlayerService",
	"VehicleService",
	"EconomyService",
	"ShopService",
	"GarageService",
	"CustomizationService",
	"JobService",
	"RaceService",
	"EventService",
	"TrafficService",
	"WeatherService",
	"TimeService",
	"CrewService",
	"MonetizationService",
	"AntiCheatService",
	"AnalyticsService",
}

local EXPECTED_JUMP_HEIGHT = 1.8

---------------------------------------------------------------------------
-- [21] settings check: one WARN per mismatch, one INFO per unreadable Studio-only value
---------------------------------------------------------------------------

local function readProperty(instance: Instance, property: string): (boolean, unknown)
	return pcall(function(): unknown
		return (instance :: any)[property]
	end)
end

local function checkValue(label: string, instance: Instance, property: string, expected: unknown)
	local ok, value = readProperty(instance, property)
	if not ok then
		log:Info("%s could not be read from a script; verify it is %s in the Properties panel", label, tostring(expected))
		return
	end
	local matches = value == expected
	if type(value) == "number" and type(expected) == "number" then
		matches = math.abs((value :: number) - (expected :: number)) < 1e-3
	end
	if not matches then
		log:Warn("%s is %s, expected %s", label, tostring(value), tostring(expected))
	end
end

local function checkSettings()
	checkValue("Workspace.Gravity", workspace, "Gravity", Game.GRAVITY)
	checkValue("Players.MaxPlayers", Players, "MaxPlayers", Game.MAX_PLAYERS)
	checkValue("Players.CharacterAutoLoads", Players, "CharacterAutoLoads", false)
	checkValue("StarterPlayer.CharacterUseJumpPower", StarterPlayer, "CharacterUseJumpPower", false)
	checkValue("StarterPlayer.CharacterJumpHeight", StarterPlayer, "CharacterJumpHeight", EXPECTED_JUMP_HEIGHT)
	checkValue("StarterPlayer.EnableMouseLockOption", StarterPlayer, "EnableMouseLockOption", false)
	-- Studio-only properties (never assigned from scripts) -- spec [14], [21], [477]
	checkValue("Workspace.StreamingEnabled", workspace, "StreamingEnabled", true)
	checkValue("Workspace.StreamingTargetRadius", workspace, "StreamingTargetRadius", 1024)
	checkValue("Workspace.StreamingMinRadius", workspace, "StreamingMinRadius", 256)
	checkValue("Workspace.StreamOutBehavior", workspace, "StreamOutBehavior", Enum.StreamOutBehavior.Opportunistic)
	checkValue(
		"Workspace.StreamingIntegrityMode",
		workspace,
		"StreamingIntegrityMode",
		Enum.StreamingIntegrityMode.MinimumRadiusPause
	)
	checkValue("Workspace.SignalBehavior", workspace, "SignalBehavior", Enum.SignalBehavior.Deferred)
	checkValue("Lighting.Technology", Lighting, "Technology", Enum.Technology.Future)
end

---------------------------------------------------------------------------
-- Module boot helpers
---------------------------------------------------------------------------

type BootRecord = { Name: string, Module: Types.BootModule?, Failed: boolean }

-- returns ok; logs one [Boot][ERROR] line on failure
local function runStep(name: string, step: string, fn: () -> ()): boolean
	local ok = true
	xpcall(fn, function(message: unknown)
		ok = false
		log:Error("%s:%s - %s", name, step, debug.traceback(tostring(message), 2))
	end)
	return ok
end

-- runs Init inside a coroutine so a yield is detected and reported
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
		local ok = runStep(record.Name, "Start", function()
			module:Start()
		end)
		if ok then
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

log:Info("%s %s server boot", Game.GAME_TITLE, Game.VERSION)
checkSettings()

local ConfigValidator = require(script.Parent.ConfigValidator)
ConfigValidator.Run()

Net.InitServer()

local servicesFolder = script.Parent:FindFirstChild("Services")
local records: { BootRecord } = {}
local registry: Types.Registry = {}

for _, name in SERVICE_ORDER do
	local module = if servicesFolder then requireModule(name, servicesFolder) else nil
	local record: BootRecord = { Name = name, Module = module, Failed = module == nil }
	table.insert(records, record)
	if module ~= nil then
		registry[name] = module
	end
end
if servicesFolder == nil then
	log:Error("ServerScriptService.Server.Services folder is missing")
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

-- DevTools: Studio only, after every other module -- spec [45]
if RunService:IsStudio() then
	local devTools = requireModule("DevTools", script.Parent)
	if devTools ~= nil then
		local devRecord: BootRecord = { Name = "DevTools", Module = devTools, Failed = false }
		if runInit(devRecord, frozenRegistry) then
			runStart(devRecord)
		end
	end
end

-- The single placeholder-asset summary WARN -- spec [13], [32]
local assetPlaceholders = AssetIds.countPlaceholders()
local soundPlaceholders = SoundIds.countPlaceholders()
if assetPlaceholders + soundPlaceholders > 0 then
	log:Warn(
		"AssetIds: %d placeholder IDs skipped (%d asset, %d sound)",
		assetPlaceholders + soundPlaceholders,
		assetPlaceholders,
		soundPlaceholders
	)
end

ReplicatedStorage:SetAttribute("ServerReady", true)

local failedNames: { string } = {}
for _, record in records do
	if record.Failed then
		table.insert(failedNames, record.Name)
	end
end
local okCount = #SERVICE_ORDER - #failedNames
local elapsedMs = (os.clock() - bootStart) * 1000
if #failedNames == 0 then
	log:Info("Boot %d/%d OK in %d ms", okCount, #SERVICE_ORDER, math.floor(elapsedMs + 0.5))
else
	log:Error("Boot %d/%d, failed: %s", okCount, #SERVICE_ORDER, table.concat(failedNames, ", "))
end
