--!strict
-- WeatherService: per-zone weather states and wetness. -- spec [330]-[333]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 7 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local WeatherService = {
	Name = "WeatherService",
	Phase = 7,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function WeatherService:Init(registry: Types.Registry)
	WeatherService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function WeatherService:Start()
	WeatherService.IsStarted = true
end

return WeatherService
