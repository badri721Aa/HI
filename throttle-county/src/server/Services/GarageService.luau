--!strict
-- GarageService: garage slots, spawning hand-off and resale. -- spec [360]-[361]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 4 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local GarageService = {
	Name = "GarageService",
	Phase = 4,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function GarageService:Init(registry: Types.Registry)
	GarageService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function GarageService:Start()
	GarageService.IsStarted = true
end

return GarageService
