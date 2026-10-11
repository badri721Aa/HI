--!strict
-- MonetizationService: game passes, ProcessReceipt and Cash bundles. -- spec [457]-[461]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 12 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local MonetizationService = {
	Name = "MonetizationService",
	Phase = 12,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function MonetizationService:Init(registry: Types.Registry)
	MonetizationService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function MonetizationService:Start()
	MonetizationService.IsStarted = true
end

return MonetizationService
