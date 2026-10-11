--!strict
-- PhoneController: the phone and its apps. -- spec [442]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 8 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local PhoneController = {
	Name = "PhoneController",
	Phase = 8,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function PhoneController:Init(registry: Types.Registry)
	PhoneController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function PhoneController:Start()
	PhoneController.IsStarted = true
end

return PhoneController
