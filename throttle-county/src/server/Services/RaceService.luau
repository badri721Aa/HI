--!strict
-- RaceService: race lobbies, timing, results and ratings. -- spec [391]-[415]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 10 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local RaceService = {
	Name = "RaceService",
	Phase = 10,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function RaceService:Init(registry: Types.Registry)
	RaceService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function RaceService:Start()
	RaceService.IsStarted = true
end

return RaceService
