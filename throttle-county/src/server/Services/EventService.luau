--!strict
-- EventService: server events, daily/weekly challenges and seasons. -- spec [363], [413]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 10 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local EventService = {
	Name = "EventService",
	Phase = 10,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function EventService:Init(registry: Types.Registry)
	EventService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function EventService:Start()
	EventService.IsStarted = true
end

return EventService
