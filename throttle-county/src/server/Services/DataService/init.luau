--!strict
-- DataService: owns every player save through ProfileStore (loleris). -- spec [451]-[456]
-- Falls back to session-only data (one WARN) when ProfileStore is not installed, and uses
-- ProfileStore's .Mock store in Studio when ServerScriptService has UseMockData = true.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Signal = require(Shared.Signal)
local Types = require(Shared.Types)
local Util = require(Shared.Util)
local Economy = require(Shared.Config.Economy)
local ProfileTemplate = require(script.ProfileTemplate)

local log = Logger.new("DataService")

local STORE_NAME = "PlayerData_v1"
local SAVE_MIN_INTERVAL_S = 6
local SHUTDOWN_WAIT_S = 25
local SHUTDOWN_POLL_S = 0.25
local PROFILE_SIZE_WARN_BYTES = 300 * 1024
local PROFILE_SIZE_ALERT_BYTES = 1024 * 1024
local KICK_LOAD_FAILED = "Your data could not be loaded, please rejoin"
local KICK_OUTDATED = "This server is outdated, please rejoin"
local KICK_SESSION_ENDED = "Your data session ended (you may have joined another server). Please rejoin."

-- What DataService needs from a ProfileStore profile (or a session-only stand-in)
type Session = {
	Data: Types.PlayerProfile,
	IsActive: () -> boolean,
	Save: () -> (),
	EndSession: () -> (),
	Reconcile: () -> (),
	AddUserId: (userId: number) -> (),
	OnSessionEnd: (fn: () -> ()) -> (),
}

type SaveState = { LastSave: number, Pending: boolean }

local DataService = {
	Name = "DataService",
	IsShuttingDown = false,
	ProfileLoaded = Signal.new(), -- (player, profile: PlayerProfile, isNew: boolean)
	ProfileReleased = Signal.new(), -- (player)
	_store = nil :: any, -- third-party ProfileStore store object (untyped package)
	_mode = "SessionOnly" :: "ProfileStore" | "Mock" | "SessionOnly",
	_sessions = {} :: { [Player]: Session },
	_saveStates = {} :: { [Player]: SaveState },
	_leaving = {} :: { [Player]: boolean },
}

---------------------------------------------------------------------------
-- Session wrappers
---------------------------------------------------------------------------

local function wrapProfileStoreProfile(profile: any): Session
	local session: Session = {
		Data = profile.Data,
		IsActive = function(): boolean
			return profile:IsActive()
		end,
		Save = function()
			profile:Save()
		end,
		EndSession = function()
			profile:EndSession()
		end,
		Reconcile = function()
			profile:Reconcile()
		end,
		AddUserId = function(userId: number)
			profile:AddUserId(userId)
		end,
		OnSessionEnd = function(fn: () -> ())
			profile.OnSessionEnd:Connect(fn)
		end,
	}
	return session
end

local function newSessionOnly(): Session
	local active = true
	local endSignal = Signal.new()
	local data = Util.deepCopy(ProfileTemplate.Profile)
	local session: Session = {
		Data = data,
		IsActive = function(): boolean
			return active
		end,
		Save = function() end,
		EndSession = function()
			if active then
				active = false
				endSignal:Fire()
			end
		end,
		Reconcile = function() end,
		AddUserId = function(_userId: number) end,
		OnSessionEnd = function(fn: () -> ())
			endSignal:Connect(fn)
		end,
	}
	return session
end

---------------------------------------------------------------------------
-- Migration and reconciliation -- spec [455]
---------------------------------------------------------------------------

local function fillMissing(target: { [string]: unknown }, template: { [string]: unknown })
	for key, value in template do
		local existing = target[key]
		if existing == nil then
			target[key] = Util.deepCopy(value)
		elseif type(existing) == "table" and type(value) == "table" then
			-- only recurse into string-keyed records; arrays and maps keep their own contents
			if next(value :: { [string]: unknown }) ~= nil and (value :: { [unknown]: unknown })[1] == nil then
				fillMissing(existing :: { [string]: unknown }, value :: { [string]: unknown })
			end
		end
	end
end

-- returns "ok", "newer" or "failed"
local function migrate(data: { [string]: unknown }): string
	if data.DataVersion == nil then
		data.DataVersion = 1
	end
	local version = data.DataVersion
	if type(version) ~= "number" then
		return "failed"
	end
	if version > ProfileTemplate.CURRENT_DATA_VERSION then
		return "newer"
	end
	if version == ProfileTemplate.CURRENT_DATA_VERSION then
		return "ok"
	end
	local working = Util.deepCopy(data)
	local ok = pcall(function()
		local v = version :: number
		while v < ProfileTemplate.CURRENT_DATA_VERSION do
			local step = ProfileTemplate.Migrations[v]
			if step == nil then
				error(string.format("no migration from version %d", v))
			end
			step(working)
			v += 1
			working.DataVersion = v
		end
	end)
	if not ok then
		return "failed"
	end
	for key in data do
		if working[key] == nil then
			data[key] = nil
		end
	end
	for key, value in working do
		data[key] = value
	end
	return "ok"
end

local function reconcileVehicles(profile: Types.PlayerProfile)
	local template = (ProfileTemplate.OwnedVehicle :: unknown) :: { [string]: unknown }
	for serial, vehicle in profile.OwnedVehicles do
		fillMissing((vehicle :: unknown) :: { [string]: unknown }, template)
		if vehicle.Serial == "" then
			vehicle.Serial = serial
		end
	end
end

local function appendLedger(profile: Types.PlayerProfile, kind: string, delta: number, ref: string)
	local head = (profile.LedgerHead % 300) + 1
	profile.LedgerHead = head
	profile.Ledger[head] = {
		Id = head,
		T = os.time(),
		Kind = kind,
		Delta = delta,
		Balance = profile.Cash,
		Ref = ref,
	}
end

local function refundRetiredVehicles(profile: Types.PlayerProfile)
	for serial, vehicle in profile.OwnedVehicles do
		if Economy.RetiredVehicleIds[vehicle.VehicleId] then
			local refund = math.max(0, math.floor(vehicle.TotalSpent))
			profile.Cash = math.clamp(profile.Cash + refund, 0, Economy.MaxCash)
			appendLedger(profile, "Refund", refund, "Retired:" .. serial)
			profile.OwnedVehicles[serial] = nil
			for _, bays in profile.Garage do
				local index = table.find(bays, serial)
				if index ~= nil then
					table.remove(bays, index)
				end
			end
			log:Info("refunded retired %s (%s) for $%d", vehicle.VehicleId, serial, refund)
		end
	end
end

-- one-time new-profile grant -- spec [344], [453]
local function grantStarter(profile: Types.PlayerProfile): boolean
	if profile.Flags.StarterGranted then
		return false
	end
	local serial = HttpService:GenerateGUID(false)
	local vehicle = Util.deepCopy(ProfileTemplate.OwnedVehicle)
	vehicle.Serial = serial
	vehicle.VehicleId = Economy.StarterVehicleId
	vehicle.AcquiredAt = os.time()
	profile.OwnedVehicles[serial] = vehicle
	local propertyId = Economy.StarterPropertyId
	if profile.Properties[propertyId] == nil then
		profile.Properties[propertyId] = os.time()
	end
	local bays = profile.Garage[propertyId]
	if bays == nil then
		bays = {}
		profile.Garage[propertyId] = bays
	end
	table.insert(bays, serial)
	profile.Flags.StarterGranted = true
	return true
end

local function measureSize(player: Player, profile: Types.PlayerProfile)
	local ok, encoded = pcall(HttpService.JSONEncode, HttpService, profile)
	if not ok then
		log:Error("profile of %d is not JSON-encodable: %s", player.UserId, tostring(encoded))
		return
	end
	local size = #(encoded :: string)
	if size >= PROFILE_SIZE_ALERT_BYTES then
		log:Error("profile of %d is %d bytes (alert threshold 1 MB)", player.UserId, size)
	elseif size >= PROFILE_SIZE_WARN_BYTES then
		log:Warn("profile of %d is %d bytes (warn threshold 300 KB)", player.UserId, size)
	end
end

---------------------------------------------------------------------------
-- Session lifecycle
---------------------------------------------------------------------------

local function startSession(player: Player): Session?
	if DataService._mode == "SessionOnly" then
		return newSessionOnly()
	end
	local store = if DataService._mode == "Mock" then DataService._store.Mock else DataService._store
	local profile = store:StartSessionAsync("Player_" .. player.UserId, {
		Cancel = function(): boolean
			return player.Parent ~= Players
		end,
	})
	if profile == nil then
		return nil
	end
	return wrapProfileStoreProfile(profile)
end

-- migrates, reconciles, refunds retired vehicles and grants the starter.
-- returns isNew, or nil when the player was kicked
local function prepareProfile(player: Player, session: Session): boolean?
	local raw = (session.Data :: unknown) :: { [string]: unknown }
	local result = migrate(raw)
	if result == "newer" then
		DataService._leaving[player] = true
		session.EndSession()
		player:Kick(KICK_OUTDATED)
		return nil
	elseif result == "failed" then
		log:Error("migration failed for %d; original data left intact", player.UserId)
		DataService._leaving[player] = true
		session.EndSession()
		player:Kick(KICK_LOAD_FAILED)
		return nil
	end
	session.Reconcile()
	local profile = session.Data
	reconcileVehicles(profile)
	profile.Cash = math.clamp(math.floor(profile.Cash), 0, Economy.MaxCash)
	refundRetiredVehicles(profile)
	return grantStarter(profile)
end

local function onPlayerAdded(player: Player)
	local session = startSession(player)
	if session == nil then
		if player.Parent == Players then
			player:Kick(KICK_LOAD_FAILED)
		end
		return
	end
	if player.Parent ~= Players then
		session.EndSession()
		return
	end
	session.AddUserId(player.UserId)
	session.OnSessionEnd(function()
		DataService._sessions[player] = nil
		DataService._saveStates[player] = nil
		DataService.ProfileReleased:Fire(player)
		local wasLeaving = DataService._leaving[player] == true
		DataService._leaving[player] = nil
		if wasLeaving then
			return
		end
		if player.Parent == Players and not DataService.IsShuttingDown then
			player:Kick(KICK_SESSION_ENDED)
		end
	end)

	local isNew = prepareProfile(player, session)
	if isNew == nil then
		return
	end
	local profile = session.Data

	DataService._sessions[player] = session
	DataService._saveStates[player] = { LastSave = 0, Pending = false }

	local vehicleIds: { string } = {}
	for _, vehicle in profile.OwnedVehicles do
		table.insert(vehicleIds, vehicle.VehicleId)
	end
	log:Info(
		"profile loaded for %s (%d): %s, %d vehicle(s) [%s], new=%s, mode=%s",
		player.Name,
		player.UserId,
		Util.formatCash(profile.Cash),
		#vehicleIds,
		table.concat(vehicleIds, ", "),
		tostring(isNew),
		DataService._mode
	)
	if isNew then
		DataService:RequestSave(player)
	end
	DataService.ProfileLoaded:Fire(player, profile, isNew)
end

local function onPlayerRemoving(player: Player)
	local session = DataService._sessions[player]
	if session ~= nil then
		DataService._leaving[player] = true
		measureSize(player, session.Data)
		session.EndSession()
	end
end

local function onClose()
	DataService.IsShuttingDown = true
	for _, session in DataService._sessions do
		session.EndSession()
	end
	if DataService._mode ~= "ProfileStore" then
		return
	end
	local deadline = os.clock() + SHUTDOWN_WAIT_S
	while os.clock() < deadline do
		local anyActive = false
		for _, session in DataService._sessions do
			if session.IsActive() then
				anyActive = true
				break
			end
		end
		if not anyActive then
			return
		end
		task.wait(SHUTDOWN_POLL_S)
	end
	log:Warn("BindToClose: sessions still active after %d s", SHUTDOWN_WAIT_S)
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------

-- wiring only: picks the storage mode and creates the store object (no web calls)
function DataService:Init(_registry: Types.Registry)
	local packages = ServerScriptService:FindFirstChild("Server")
	packages = if packages then packages:FindFirstChild("Packages") else nil
	local module = if packages then packages:FindFirstChild("ProfileStore") else nil
	if module == nil or not module:IsA("ModuleScript") then
		log:Warn("ProfileStore not found at ServerScriptService.Server.Packages.ProfileStore - using session-only data (nothing saves)")
		DataService._mode = "SessionOnly"
		return
	end
	local ProfileStore = require(module) :: any
	DataService._store = ProfileStore.New(STORE_NAME, ProfileTemplate.Profile)
	local useMock = RunService:IsStudio() and ServerScriptService:GetAttribute("UseMockData") == true
	DataService._mode = if useMock then "Mock" else "ProfileStore"
end

-- binds player sessions and shutdown handling
function DataService:Start()
	game:BindToClose(onClose)
	-- lifetime: server
	Players.PlayerAdded:Connect(function(player: Player)
		task.spawn(onPlayerAdded, player)
	end)
	-- lifetime: server
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end
end

-- returns the loaded profile or nil (never yields)
function DataService:GetProfile(player: Player): Types.PlayerProfile?
	local session = DataService._sessions[player]
	return if session then session.Data else nil
end

-- yields up to timeout_s for the profile; returns nil on timeout or when the player left
function DataService:WaitForProfile(player: Player, timeout_s: number): Types.PlayerProfile?
	local deadline = os.clock() + timeout_s
	while player.Parent == Players and os.clock() < deadline do
		local profile = DataService:GetProfile(player)
		if profile ~= nil then
			return profile
		end
		task.wait(0.1)
	end
	return DataService:GetProfile(player)
end

-- the only caller of profile:Save(); at most one save per 6 s, extra requests merge into one
function DataService:RequestSave(player: Player)
	local state: SaveState? = DataService._saveStates[player]
	if state == nil or state.Pending then
		return
	end
	local wait_s = state.LastSave + SAVE_MIN_INTERVAL_S - os.clock()
	if wait_s <= 0 then
		local session = DataService._sessions[player]
		if session ~= nil and session.IsActive() then
			state.LastSave = os.clock()
			session.Save()
		end
		return
	end
	state.Pending = true
	task.delay(wait_s, function()
		state.Pending = false
		local session = DataService._sessions[player]
		if session ~= nil and session.IsActive() then
			state.LastSave = os.clock()
			session.Save()
		end
	end)
end

-- returns a deep copy without Receipts, Ledger, LedgerHead and Strikes -- spec [456]
function DataService:GetSanitizedSnapshot(player: Player): { [string]: unknown }?
	local profile = DataService:GetProfile(player)
	if profile == nil then
		return nil
	end
	local copy = (Util.deepCopy(profile) :: unknown) :: { [string]: unknown }
	copy.Receipts = nil
	copy.Ledger = nil
	copy.LedgerHead = nil
	copy.Strikes = nil
	return copy
end

-- returns true when profiles are not persisted (session-only or Studio mock)
function DataService:IsSessionOnly(): boolean
	return DataService._mode ~= "ProfileStore"
end

-- DevTools /resetdata: wipes to defaults and re-grants the starter (mock/session-only only)
function DataService:ResetProfile(player: Player): boolean
	if not DataService:IsSessionOnly() then
		return false
	end
	local session = DataService._sessions[player]
	if session == nil then
		return false
	end
	local data = (session.Data :: unknown) :: { [string]: unknown }
	for key in data do
		data[key] = nil
	end
	local fresh = (Util.deepCopy(ProfileTemplate.Profile) :: unknown) :: { [string]: unknown }
	for key, value in fresh do
		data[key] = value
	end
	grantStarter(session.Data)
	log:Info("profile of %d reset to defaults", player.UserId)
	return true
end

return DataService
