--!strict
-- ShopService: dealership purchases, rentals, test rides and the used lot. -- spec [358]-[359]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 4 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local ShopService = {
	Name = "ShopService",
	Phase = 4,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function ShopService:Init(registry: Types.Registry)
	ShopService._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function ShopService:Start()
	ShopService.IsStarted = true
end

return ShopService
