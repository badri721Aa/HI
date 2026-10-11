--!strict
-- CameraController: chase, POV, cinematic and garage cameras. -- spec [119]-[123]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 2 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local CameraController = {
	Name = "CameraController",
	Phase = 2,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function CameraController:Init(registry: Types.Registry)
	CameraController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function CameraController:Start()
	CameraController.IsStarted = true
end

return CameraController
