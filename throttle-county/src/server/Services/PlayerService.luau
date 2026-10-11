--!strict
-- PlayerService: gates character spawning on a loaded profile, tracks Player_Ready and sends
-- the sanitized data snapshot. -- spec [25], [452], [456], [462]
-- Players.CharacterAutoLoads must be false (MANUAL STEP); characters load only after the
-- profile is ready, and respawn after death the same way.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Net = require(Shared.Net)
local Signal = require(Shared.Signal)
local Trove = require(Shared.Trove)
local Types = require(Shared.Types)

local log = Logger.new("PlayerService")

local PROFILE_LOAD_TIMEOUT_S = 30
local KICK_SLOW_LOAD = "Loading your data took too long. Please rejoin."

type PlayerState = {
	Trove: Trove.Trove,
	ProfileReady: boolean,
	ClientReady: boolean,
	SnapshotSent: boolean,
}

local PlayerService = {
	Name = "PlayerService",
	PlayerReady = Signal.new(), -- (player): profile loaded and client ready
	_dataService = nil :: Types.IDataService?,
	_states = {} :: { [Player]: PlayerState },
}

local function getState(player: Player): PlayerState?
	return PlayerService._states[player]
end

local function trySendSnapshot(player: Player)
	local state = getState(player)
	local dataService = PlayerService._dataService
	if state == nil or dataService == nil or state.SnapshotSent then
		return
	end
	if not (state.ProfileReady and state.ClientReady) then
		return
	end
	local snapshot = dataService:GetSanitizedSnapshot(player)
	if snapshot == nil then
		return
	end
	state.SnapshotSent = true
	Net.Fire("Data_Snapshot", player, snapshot)
	PlayerService.PlayerReady:Fire(player)
end

local function loadCharacter(player: Player)
	if player.Parent ~= Players then
		return
	end
	local ok, err = pcall(player.LoadCharacterAsync, player)
	if not ok then
		log:Error("LoadCharacterAsync failed for %d: %s", player.UserId, tostring(err))
	end
end

local function onCharacterAdded(player: Player, character: Model)
	local state = getState(player)
	if state == nil then
		return
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid == nil then
		return
	end
	state.Trove:Connect(humanoid.Died, function()
		if Players.CharacterAutoLoads then
			return
		end
		task.delay(Players.RespawnTime, function()
			if player.Parent == Players and player.Character == character then
				loadCharacter(player)
			end
		end)
	end)
end

local onProfileLoaded: (player: Player, profile: Types.PlayerProfile, isNew: boolean) -> ()

local function onPlayerAdded(player: Player)
	if PlayerService._states[player] ~= nil then
		return
	end
	local state: PlayerState = {
		Trove = Trove.new(),
		ProfileReady = false,
		ClientReady = false,
		SnapshotSent = false,
	}
	PlayerService._states[player] = state
	state.Trove:Connect(player.CharacterAdded, function(character: Model)
		onCharacterAdded(player, character)
	end)
	if player.Character ~= nil then
		onCharacterAdded(player, player.Character)
	end
	local timeout = task.delay(PROFILE_LOAD_TIMEOUT_S, function()
		if player.Parent == Players and not state.ProfileReady then
			log:Warn("profile for %d not loaded after %d s; kicking", player.UserId, PROFILE_LOAD_TIMEOUT_S)
			player:Kick(KICK_SLOW_LOAD)
		end
	end)
	state.Trove:Add(timeout)
	-- the profile may have finished loading before this handler ran (session-only mode)
	local dataService = PlayerService._dataService
	if dataService ~= nil and dataService:GetProfile(player) ~= nil then
		task.defer(function()
			local profile = dataService:GetProfile(player)
			if profile ~= nil and not state.ProfileReady then
				onProfileLoaded(player, profile, false)
			end
		end)
	end
end

function onProfileLoaded(player: Player, _profile: Types.PlayerProfile, _isNew: boolean)
	local state = getState(player)
	if state == nil then
		return
	end
	state.ProfileReady = true
	if player.Character == nil and not Players.CharacterAutoLoads then
		loadCharacter(player)
	end
	trySendSnapshot(player)
end

local function onPlayerRemoving(player: Player)
	local state = getState(player)
	if state ~= nil then
		state.Trove:Destroy()
		PlayerService._states[player] = nil
	end
end

-- wiring only: stores DataService and listens for ProfileLoaded
function PlayerService:Init(registry: Types.Registry)
	local dataService = registry.DataService :: Types.IDataService
	PlayerService._dataService = dataService
	-- lifetime: server
	dataService.ProfileLoaded:Connect(onProfileLoaded)
end

-- binds players and the Player_Ready remote
function PlayerService:Start()
	-- lifetime: server
	Players.PlayerAdded:Connect(onPlayerAdded)
	-- lifetime: server
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in Players:GetPlayers() do
		onPlayerAdded(player)
	end
	Net.On("Player_Ready", function(player: Player)
		local state = getState(player)
		if state == nil or state.ClientReady then
			return
		end
		state.ClientReady = true
		trySendSnapshot(player)
	end)
end

-- returns true once the profile is loaded and the client reported Player_Ready
function PlayerService:IsReady(player: Player): boolean
	local state = getState(player)
	return state ~= nil and state.SnapshotSent
end

return PlayerService
