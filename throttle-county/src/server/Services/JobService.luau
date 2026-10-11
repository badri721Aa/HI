--!strict
-- JobService: job offers, state machines and payouts. -- spec [345]-[357]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 8 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local JobService = {
	Name = "JobService",
	Phase = 8,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function JobService:Init(registry: Types.Registry)
	JobService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function JobService:Start()
	JobService.IsStarted = true
end

return JobService
