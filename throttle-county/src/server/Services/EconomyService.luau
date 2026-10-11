--!strict
-- EconomyService: sole writer of Cash, Rep and the Ledger. -- spec [341]-[365]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 8 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local EconomyService = {
	Name = "EconomyService",
	Phase = 8,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function EconomyService:Init(registry: Types.Registry)
	EconomyService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function EconomyService:Start()
	EconomyService.IsStarted = true
end

return EconomyService
