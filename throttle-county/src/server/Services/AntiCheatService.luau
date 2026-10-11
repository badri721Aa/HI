--!strict
-- AntiCheatService: per-player violation score fed by Net.Violation. -- spec [35], [471], [473]
-- Phase 1 keeps the decaying score only; movement rules, flags, kicks and admin tools arrive
-- with Phase 2 ([75]) and Phase 12 ([470]-[474]).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Net = require(Shared.Net)
local Types = require(Shared.Types)

local log = Logger.new("AntiCheatService")

local DECAY_PER_S = 1 / 60 -- one point per 60 s -- spec [473]

type ScoreState = { Score: number, Updated: number }

local AntiCheatService = {
	Name = "AntiCheatService",
	_scores = {} :: { [Player]: ScoreState },
}

local function decayed(state: ScoreState): number
	local now = os.clock()
	state.Score = math.max(0, state.Score - (now - state.Updated) * DECAY_PER_S)
	state.Updated = now
	return state.Score
end

local function onViolation(player: Player, remoteName: string, reason: string, weight: number)
	if player.Parent ~= Players then
		return
	end
	local state = AntiCheatService._scores[player]
	if state == nil then
		state = { Score = 0, Updated = os.clock() }
		AntiCheatService._scores[player] = state
	end
	decayed(state)
	state.Score += weight
	log:Debug("violation %d %s %s (+%d, score %.1f)", player.UserId, remoteName, reason, weight, state.Score)
end

-- wiring only: subscribes to Net.Violation
function AntiCheatService:Init(_registry: Types.Registry)
	-- lifetime: server
	Net.Violation:Connect(onViolation)
end

-- clears per-player state on leave
function AntiCheatService:Start()
	-- lifetime: server
	Players.PlayerRemoving:Connect(function(player: Player)
		AntiCheatService._scores[player] = nil
	end)
end

-- returns the player's current (decayed) violation score in points
function AntiCheatService:GetScore(player: Player): number
	local state = AntiCheatService._scores[player]
	return if state then decayed(state) else 0
end

return AntiCheatService
