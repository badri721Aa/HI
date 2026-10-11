--!strict
-- CustomizationService: parts, paint, tunes, gear and PI. -- spec [366]-[390]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 9 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local CustomizationService = {
	Name = "CustomizationService",
	Phase = 9,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function CustomizationService:Init(registry: Types.Registry)
	CustomizationService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function CustomizationService:Start()
	CustomizationService.IsStarted = true
end

return CustomizationService
