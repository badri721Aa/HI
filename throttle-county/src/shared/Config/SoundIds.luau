--!strict
-- Config/SoundIds: every audio asset ID. -- spec [13], [38], [252]
-- Every entry is 0 until the user uploads licensed audio and pastes its ID. Never invent IDs.
-- get(path) returns "rbxassetid://N", or nil for 0/missing entries after logging the key once.

local Logger = require(script.Parent.Parent.Logger)

local log = Logger.new("SoundIds")

local ids = {
	Tires = {
		Asphalt = 0, -- seamless 2 s rolling loop on asphalt, 48 kHz mono .ogg
		Dirt = 0, -- rolling loop on packed dirt
		Gravel = 0, -- rolling loop on gravel
		Mud = 0, -- rolling loop through mud
		Sand = 0, -- rolling loop through sand
		Grass = 0, -- rolling loop on grass
		Snow = 0, -- rolling loop on snow
		Wood = 0, -- rolling loop on wooden planks
	},
	Horns = {
		Bell = 0, -- bicycle bell one-shot
		Beeper = 0, -- light-EV electronic beep, loopable 0.5 s
		Moto = 0, -- motorcycle horn, loopable
		AirHorn = 0, -- truck air horn, loopable
	},
	Impacts = {
		BodyThud = 0, -- dull body impact one-shot (no bone or pain sounds)
		Plastic = 0, -- plastic panel crack one-shot
		Metal = 0, -- metal clang one-shot
		Dirt = 0, -- dirt thump one-shot
		Splash = 0, -- water splash one-shot
	},
	UI = {
		Click = 0, -- short UI tick
		Confirm = 0, -- positive confirm chime
		Error = 0, -- soft error tone
		CashIn = 0, -- coin/register cue
		LevelUp = 0, -- level-up stinger
		Toast = 0, -- notification pop
	},
	Radio = {
		Drive1 = 0, -- licensed Creator Store track for the Drive station
		Dirt1 = 0, -- licensed Creator Store track for the Dirt station
		Chill1 = 0, -- licensed Creator Store track for the Chill station
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

local SoundIds = {}

-- returns "rbxassetid://N" or nil when the entry is 0 or missing (logged once at INFO)
function SoundIds.get(path: string): string?
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
function SoundIds.has(path: string): boolean
	local found = lookup(path)
	return found
end

-- returns the number of 0 placeholder entries
function SoundIds.countPlaceholders(): number
	local cached = placeholderCount
	if cached ~= nil then
		return cached
	end
	local total = countZeros(ids)
	placeholderCount = total
	return total
end

return table.freeze(SoundIds)
