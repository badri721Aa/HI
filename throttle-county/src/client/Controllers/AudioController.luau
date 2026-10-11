--!strict
-- AudioController: engine, tire, wind, ambience and radio audio. -- spec [251]-[270]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 3 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local AudioController = {
	Name = "AudioController",
	Phase = 3,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function AudioController:Init(registry: Types.Registry)
	AudioController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function AudioController:Start()
	AudioController.IsStarted = true
end

return AudioController
