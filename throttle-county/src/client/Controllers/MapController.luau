--!strict
-- MapController: minimap and region weighting. -- spec [441]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 6 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local MapController = {
	Name = "MapController",
	Phase = 6,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function MapController:Init(registry: Types.Registry)
	MapController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function MapController:Start()
	MapController.IsStarted = true
end

return MapController
