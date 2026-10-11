--!strict
-- AnalyticsService: onboarding funnel, economy and custom analytics events. -- spec [365], [449], [484]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 12 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local AnalyticsService = {
	Name = "AnalyticsService",
	Phase = 12,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function AnalyticsService:Init(registry: Types.Registry)
	AnalyticsService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function AnalyticsService:Start()
	AnalyticsService.IsStarted = true
end

return AnalyticsService
