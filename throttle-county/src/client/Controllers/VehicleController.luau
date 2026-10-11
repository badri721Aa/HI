--!strict
-- VehicleController: steps the locally owned vehicle in PreSimulation. -- spec [46]-[75]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 2 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local VehicleController = {
	Name = "VehicleController",
	Phase = 2,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function VehicleController:Init(registry: Types.Registry)
	VehicleController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function VehicleController:Start()
	VehicleController.IsStarted = true
end

return VehicleController
