--!strict
-- VehicleService: spawning, ownership, enter/exit, damage state and the 10 Hz sampler. -- spec [46]-[75], [242]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 2 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local VehicleService = {
	Name = "VehicleService",
	Phase = 2,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function VehicleService:Init(registry: Types.Registry)
	VehicleService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function VehicleService:Start()
	VehicleService.IsStarted = true
end

return VehicleService
