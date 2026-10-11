--!strict
-- CrewService: crews, roles, invites and meetups. -- spec [463]-[464]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 12 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local CrewService = {
	Name = "CrewService",
	Phase = 12,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function CrewService:Init(registry: Types.Registry)
	CrewService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function CrewService:Start()
	CrewService.IsStarted = true
end

return CrewService
