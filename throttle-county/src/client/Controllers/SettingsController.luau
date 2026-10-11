--!strict
-- SettingsController: settings screens and Settings_Save. -- spec [446]-[447]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 12 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local SettingsController = {
	Name = "SettingsController",
	Phase = 12,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function SettingsController:Init(registry: Types.Registry)
	SettingsController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function SettingsController:Start()
	SettingsController.IsStarted = true
end

return SettingsController
