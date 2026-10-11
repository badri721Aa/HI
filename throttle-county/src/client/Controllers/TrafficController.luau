--!strict
-- TrafficController: client-simulated traffic, pedestrians and world life. -- spec [416]-[430]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 11 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local TrafficController = {
	Name = "TrafficController",
	Phase = 11,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function TrafficController:Init(registry: Types.Registry)
	TrafficController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function TrafficController:Start()
	TrafficController.IsStarted = true
end

return TrafficController
