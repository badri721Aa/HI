--!strict
-- UIController: screen layers, garage, dealership and tutorial. -- spec [431]-[435], [444]-[449]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 4 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local UIController = {
	Name = "UIController",
	Phase = 4,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function UIController:Init(registry: Types.Registry)
	UIController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function UIController:Start()
	UIController.IsStarted = true
end

return UIController
