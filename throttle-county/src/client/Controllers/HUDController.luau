--!strict
-- HUDController: speed/tach cluster, minimap host, toasts and race block. -- spec [436]-[440]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 12 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local HUDController = {
	Name = "HUDController",
	Phase = 12,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function HUDController:Init(registry: Types.Registry)
	HUDController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function HUDController:Start()
	HUDController.IsStarted = true
end

return HUDController
