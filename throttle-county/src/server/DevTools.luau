--!strict
-- DevTools (server): Studio-only developer commands behind a UserId allowlist. Required by
-- Main only when RunService:IsStudio(); the Dev_Command remote does not exist in live servers.
-- -- spec [45], [482]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Stats = game:GetService("Stats")

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Net = require(Shared.Net)
local NetDefs = require(Shared.NetDefs)
local Trove = require(Shared.Trove)
local Types = require(Shared.Types)
local Util = require(Shared.Util)
local TestKit = require(script.Parent.Tests.TestKit)

local log = Logger.new("DevTools")

-- Studio local-server test players get negative UserIds (-1, -2, ...). Remove an entry to
-- test the "denied" path. Add your own UserId here if the place is group-owned.
local LOCAL_TEST_USER_IDS = { -1, -2, -3, -4, -5, -6, -7, -8 }
local EXTRA_ALLOWED_USER_IDS: { number } = {}

local LEAKTEST_PARTS_PER_MODEL = 12
local LEAKTEST_SETTLE_S = 10
local MAX_LEAKTEST = 500

-- canon region centers -- spec [45], [272], [300], [309], [315]-[318]
local REGION_CENTERS: { [string]: Vector3 } = {
	oldtown = Vector3.new(0, 15, 0),
	harbor = Vector3.new(2500, 15, 300),
	maple = Vector3.new(0, 40, -3500),
	port = Vector3.new(5800, 8, 1300),
	airfield = Vector3.new(6000, 10, -1800),
	beach = Vector3.new(1000, 10, 6000),
	throttlepark = Vector3.new(-3000, 20, 600),
	pinecrest = Vector3.new(-4100, 180, -3500),
	redmesa = Vector3.new(-5300, 30, 5150),
	lake = Vector3.new(4000, 25, -4700),
}

type Command = { Usage: string, Run: (player: Player, args: { string }) -> string }

local DevTools = {
	Name = "DevTools",
	_dataService = nil :: Types.IDataService?,
	_allowed = {} :: { [number]: boolean },
	_commands = {} :: { [string]: Command },
}

local function reply(player: Player, text: string)
	Net.Fire("Dev_Reply", player, text)
end

local function notYet(phase: number, what: string): string
	return string.format("%s arrives in Phase %d", what, phase)
end

---------------------------------------------------------------------------
-- Commands
---------------------------------------------------------------------------

local function cmdTeleport(player: Player, args: { string }): string
	local region = string.lower(args[1] or "")
	local center: Vector3? = REGION_CENTERS[region]
	if center == nil then
		local names: { string } = {}
		for name in REGION_CENTERS do
			table.insert(names, name)
		end
		table.sort(names)
		return "usage: /tp " .. table.concat(names, "|")
	end
	local character = player.Character
	local root = if character then character.PrimaryPart else nil
	if character == nil or root == nil then
		return "no character to teleport"
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }
	local hit = workspace:Raycast(center + Vector3.new(0, 500, 0), Vector3.new(0, -1000, 0), params)
	if hit == nil then
		return string.format("no ground at %s yet (world blockout arrives in Phase 6)", region)
	end
	character:PivotTo(CFrame.new(hit.Position + Vector3.new(0, 4, 0)))
	return string.format("teleported to %s", region)
end

local function cmdSelfTest(_player: Player, _args: { string }): string
	local report: TestKit.Report = { Passed = 0, Failed = 0, Failures = {} }
	local tests = script.Parent:FindFirstChild("Tests")
	if tests == nil then
		return "Tests folder missing"
	end
	for _, module in tests:GetChildren() do
		if module:IsA("ModuleScript") and string.sub(module.Name, -5) == ".spec" then
			local ok, spec = pcall(require, module)
			if ok and type(spec) == "function" then
				TestKit.run(module.Name, spec, report)
			else
				report.Failed += 1
				table.insert(report.Failures, module.Name .. ": could not load")
			end
		end
	end
	for _, failure in report.Failures do
		log:Warn("selftest FAIL %s", failure)
	end
	return string.format("selftest: %d passed, %d failed", report.Passed, report.Failed)
end

local function junkArgs(count: number, value: unknown): { unknown }
	local args: { unknown } = {}
	for i = 1, math.max(count, 1) do
		args[i] = value
	end
	return args
end

local function cmdFuzz(player: Player, _args: { string }): string
	local payloads: { unknown } = { 0 / 0, math.huge, string.rep("x", 10240), {}, Vector3.new(0 / 0, 0, 0) }
	local reached = 0
	local sent = 0
	for name, def in NetDefs do
		if def.Direction == "ToClient" or def.StudioOnly then
			continue
		end
		local count = #def.Args
		for _, payload in payloads do
			local args = junkArgs(count, payload)
			sent += 1
			if Net.SimulateIncoming(player, name, table.unpack(args, 1, math.max(count, 1))) then
				reached += 1
			end
		end
		-- wrong argument count: one extra nil-free argument
		local extra = junkArgs(count + 1, "x")
		sent += 1
		if Net.SimulateIncoming(player, name, table.unpack(extra, 1, count + 1)) then
			reached += 1
		end
	end
	return string.format("fuzz: %d malformed calls, %d reached a handler", sent, reached)
end

local function buildLeakModel(index: number): Model
	local model = Instance.new("Model")
	model.Name = "LeakTest_" .. index
	local root: BasePart? = nil
	for i = 1, LEAKTEST_PARTS_PER_MODEL do
		local part = Instance.new("Part")
		part.Size = Vector3.new(1, 1, 1)
		part.Anchored = true
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		part.Transparency = 1
		part.Position = Vector3.new(index * 3, 400 + i, 0)
		part.Parent = model
		if root == nil then
			root = part
		end
	end
	model.PrimaryPart = root
	return model
end

local function cmdLeakTest(player: Player, args: { string }): string
	local count = math.clamp(math.floor(tonumber(args[1]) or 200), 1, MAX_LEAKTEST)
	local baselineCount = #workspace:GetDescendants()
	local baselineMemory = Stats:GetTotalMemoryUsageMb()
	task.spawn(function()
		local trove = Trove.new()
		for i = 1, count do
			local model = trove:Add(buildLeakModel(i))
			model.Parent = workspace
			if i % 25 == 0 then
				task.wait()
			end
		end
		trove:Destroy()
		task.wait(LEAKTEST_SETTLE_S)
		local countDelta = #workspace:GetDescendants() - baselineCount
		local memoryDelta = Stats:GetTotalMemoryUsageMb() - baselineMemory
		local pass = countDelta == 0 and memoryDelta <= 5
		reply(
			player,
			string.format(
				"leaktest %d: descendants delta %d, memory delta %.1f MB -> %s",
				count,
				countDelta,
				memoryDelta,
				if pass then "PASS" else "CHECK"
			)
		)
	end)
	return string.format("leaktest: building and cleaning %d models (vehicles from Phase 2), settling %d s", count, LEAKTEST_SETTLE_S)
end

local function cmdSimFail(_player: Player, args: { string }): string
	if args[1] ~= "web" then
		return "usage: /simfail web n"
	end
	local n = math.clamp(math.floor(tonumber(args[2]) or 0), 0, 4)
	Util.setSimulatedWebFailures(n)
	task.spawn(function()
		local attempts = 0
		local ok = Util.retryAsync("SimFailProbe", function(): unknown
			attempts += 1
			return true
		end)
		log:Info("simfail probe: success=%s after %d injected failure(s), fn ran %d time(s)", tostring(ok), n, attempts)
	end)
	return string.format("next %d web attempt(s) will fail; probe running (backoff 1, 2, 4 s)", n)
end

local function cmdDebugLog(_player: Player, args: { string }): string
	local mode = args[1]
	if mode ~= "on" and mode ~= "off" then
		return "usage: /debuglog on|off"
	end
	ReplicatedStorage:SetAttribute("DebugLogging", mode == "on")
	return "debug logging " .. mode
end

local function cmdResetData(player: Player, _args: { string }): string
	local dataService = DevTools._dataService
	if dataService == nil then
		return "DataService unavailable"
	end
	if ServerScriptService:GetAttribute("UseMockData") ~= true and not dataService:IsSessionOnly() then
		return "refused: set ServerScriptService attribute UseMockData = true first"
	end
	if dataService:ResetProfile(player) then
		return "profile reset to defaults (starter BMX re-granted); rejoin to see a fresh load"
	end
	return "reset failed (profile not loaded or not a mock/session-only profile)"
end

local function cmdProfile(player: Player, _args: { string }): string
	local dataService = DevTools._dataService
	local profile = if dataService then dataService:GetProfile(player) else nil
	if profile == nil then
		return "profile not loaded"
	end
	local ids: { string } = {}
	for _, vehicle in profile.OwnedVehicles do
		table.insert(ids, vehicle.VehicleId)
	end
	return string.format("Cash %s, L%d, vehicles: %s", Util.formatCash(profile.Cash), profile.Level, table.concat(ids, ", "))
end

local function cmdHelp(_player: Player, _args: { string }): string
	local names: { string } = {}
	for name, command in DevTools._commands do
		table.insert(names, "/" .. name .. " " .. command.Usage)
	end
	table.sort(names)
	return table.concat(names, " | ")
end

local function deferred(phase: number, what: string): (Player, { string }) -> string
	return function(_player: Player, _args: { string }): string
		return notYet(phase, what)
	end
end

local function registerCommands()
	local commands = DevTools._commands
	commands.help = { Usage = "", Run = cmdHelp }
	commands.tp = { Usage = "region", Run = cmdTeleport }
	commands.selftest = { Usage = "", Run = cmdSelfTest }
	commands.fuzz = { Usage = "", Run = cmdFuzz }
	commands.leaktest = { Usage = "n", Run = cmdLeakTest }
	commands.simfail = { Usage = "web n", Run = cmdSimFail }
	commands.debuglog = { Usage = "on|off", Run = cmdDebugLog }
	commands.resetdata = { Usage = "", Run = cmdResetData }
	commands.profile = { Usage = "", Run = cmdProfile }
	commands.cash = { Usage = "n", Run = deferred(8, "/cash (EconomyService)") }
	commands.level = { Usage = "n", Run = deferred(8, "/level (EconomyService)") }
	commands.spawn = { Usage = "vehicleId", Run = deferred(2, "/spawn (VehicleService)") }
	commands.stress = { Usage = "n", Run = deferred(2, "/stress (dummy riders)") }
	commands.time = { Usage = "hh", Run = deferred(7, "/time (TimeService)") }
	commands.weather = { Usage = "state", Run = deferred(7, "/weather (WeatherService)") }
	commands.wet = { Usage = "0-1", Run = deferred(7, "/wet (WeatherService)") }
end

local function onCommand(player: Player, text: string)
	local isAllowed = DevTools._allowed[player.UserId] == true
	log:Info("command from %d (%s): %s", player.UserId, if isAllowed then "allowed" else "denied", text)
	if not isAllowed then
		reply(player, "denied")
		return
	end
	local words: { string } = {}
	for word in string.gmatch(text, "%S+") do
		table.insert(words, word)
	end
	local head = string.lower((string.gsub(words[1] or "", "^/", "")))
	local command = DevTools._commands[head]
	if command == nil then
		reply(player, "unknown command; try /help")
		return
	end
	table.remove(words, 1)
	reply(player, command.Run(player, words))
end

-- wiring only: stores DataService, builds the allowlist and command table
function DevTools:Init(registry: Types.Registry)
	DevTools._dataService = registry.DataService :: Types.IDataService
	for _, userId in LOCAL_TEST_USER_IDS do
		DevTools._allowed[userId] = true
	end
	for _, userId in EXTRA_ALLOWED_USER_IDS do
		DevTools._allowed[userId] = true
	end
	if game.CreatorType == Enum.CreatorType.User and game.CreatorId ~= 0 then
		DevTools._allowed[game.CreatorId] = true
	end
	registerCommands()
end

-- binds the Studio-only Dev_Command remote
function DevTools:Start()
	Net.On("Dev_Command", onCommand)
	if next(DevTools._allowed) ~= nil and not DevTools._allowed[game.CreatorId] then
		log:Info("unpublished or group-owned place: only local test players and EXTRA_ALLOWED_USER_IDS may use DevTools")
	end
	for _, player in Players:GetPlayers() do
		log:Debug("player %d DevTools access: %s", player.UserId, tostring(DevTools._allowed[player.UserId] == true))
	end
end

return DevTools
