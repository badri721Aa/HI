--!strict
-- WeatherFXController: lighting mixer, precipitation and VFX. -- spec [321]-[340]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 7 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local WeatherFXController = {
	Name = "WeatherFXController",
	Phase = 7,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function WeatherFXController:Init(registry: Types.Registry)
	WeatherFXController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function WeatherFXController:Start()
	WeatherFXController.IsStarted = true
end

return WeatherFXController
