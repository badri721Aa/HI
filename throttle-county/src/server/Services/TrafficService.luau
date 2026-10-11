--!strict
-- TrafficService: traffic facts, signal epoch and Street Rules heat. -- spec [416]-[430]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 11 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local TrafficService = {
	Name = "TrafficService",
	Phase = 11,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function TrafficService:Init(registry: Types.Registry)
	TrafficService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function TrafficService:Start()
	TrafficService.IsStarted = true
end

return TrafficService
