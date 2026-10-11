--!strict
-- RiderAnimationController: rider poses, IK, crashes and get-up. -- spec [227]-[241]
-- Phase 1 contract module: boots in canonical order and holds its registry; the full
-- implementation is delivered in Phase 5 as a REPLACES file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)

local RiderAnimationController = {
	Name = "RiderAnimationController",
	Phase = 5,
	IsStarted = false,
	_registry = nil :: Types.Registry?,
}

-- wiring only: keeps the registry for dependency lookups -- spec [26]
function RiderAnimationController:Init(registry: Types.Registry)
	RiderAnimationController._registry = registry
end

-- marks the module started; later phases bind remotes and loops here
function RiderAnimationController:Start()
	RiderAnimationController.IsStarted = true
end

return RiderAnimationController
