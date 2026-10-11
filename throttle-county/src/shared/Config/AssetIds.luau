--!strict
-- Config/AssetIds: every image, mesh, animation, badge and texture ID. -- spec [13], [38]
-- Every entry is 0 until the user uploads the asset and pastes its ID. Never invent IDs.
-- get(path) returns "rbxassetid://N", or nil for 0/missing entries after logging the key once.

local Logger = require(script.Parent.Parent.Logger)

local log = Logger.new("AssetIds")

local ids = {
	UI = {
		IconAtlas = 0, -- 1024x1024 PNG, 64 px icon grid, white glyphs on transparent
		MapTile_1_1 = 0, -- 512x512 PNG map tile, row 1 column 1 (16 tiles total, added in Phase 6)
		GpsChevron = 0, -- 64x256 PNG scrolling cyan chevron strip for GPS beams
		RainDrop = 0, -- 128x128 PNG translucent droplet for helmet-POV rain
	},
	Sky = {
		SkyboxBk = 0, -- 1024x1024 skybox face (back); Roblox default sky is used while 0
		SkyboxDn = 0, -- 1024x1024 skybox face (down)
		SkyboxFt = 0, -- 1024x1024 skybox face (front)
		SkyboxLf = 0, -- 1024x1024 skybox face (left)
		SkyboxRt = 0, -- 1024x1024 skybox face (right)
		SkyboxUp = 0, -- 1024x1024 skybox face (up)
		Sun = 0, -- 256x256 sun texture
		Moon = 0, -- 256x256 moon texture
	},
	Textures = {
		TireMark = 0, -- 128x512 PNG dark tread print with alpha, tiles along V
		LaneDash = 0, -- 64x512 PNG white dash on transparent, 43.5-stud repeat
	},
	Animations = {
		Pose_MX = 0, -- R15 looped single-keyframe pose, standing MX rider seated
		Pose_Street = 0, -- R15 looped pose, upright street rider
		LeanL = 0, -- R15 looped blend pose, lean left
		LeanR = 0, -- R15 looped blend pose, lean right
		Kickstart = 0, -- R15 one-shot, right-leg kick with a "Kick" marker
		GetUpFront = 0, -- R15 one-shot, rise from face-down
		GetUpBack = 0, -- R15 one-shot, rise from face-up
	},
	Badges = {
		HotAndFresh = 0, -- badge: 100 deliveries at 95% condition
		CountyLegend = 0, -- badge: reach Rep L100
	},
}

local placeholderCount: number? = nil

local function lookup(path: string): (boolean, number?)
	local node: unknown = ids
	for segment in string.gmatch(path, "[^%.]+") do
		if type(node) ~= "table" then
			return false, nil
		end
		node = (node :: { [string]: unknown })[segment]
		if node == nil then
			return false, nil
		end
	end
	if type(node) ~= "number" then
		return false, nil
	end
	return true, node :: number
end

local function countZeros(node: unknown): number
	if type(node) == "number" then
		return if node == 0 then 1 else 0
	end
	if type(node) ~= "table" then
		return 0
	end
	local total = 0
	for _, value in node :: { [string]: unknown } do
		total += countZeros(value)
	end
	return total
end

local AssetIds = {}

-- returns "rbxassetid://N" or nil when the entry is 0 or missing (logged once at INFO)
function AssetIds.get(path: string): string?
	local found, id = lookup(path)
	if not found then
		log:InfoOnce(path, "missing key %s skipped", path)
		return nil
	end
	if id == nil or id == 0 then
		log:InfoOnce(path, "placeholder %s skipped", path)
		return nil
	end
	return "rbxassetid://" .. tostring(id)
end

-- returns true when the key exists (zero or not); used by ConfigValidator
function AssetIds.has(path: string): boolean
	local found = lookup(path)
	return found
end

-- returns the number of 0 placeholder entries
function AssetIds.countPlaceholders(): number
	local cached = placeholderCount
	if cached ~= nil then
		return cached
	end
	local total = countZeros(ids)
	placeholderCount = total
	return total
end

return table.freeze(AssetIds)
