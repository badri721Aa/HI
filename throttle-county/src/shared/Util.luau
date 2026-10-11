--!strict
-- Util: pure, stateless helpers plus retryAsync and the frozen tag/attribute name tables. -- spec [33], [41], [43]
-- Layer 1: requires only Units and Logger.

local Units = require(script.Parent.Units)
local Logger = require(script.Parent.Logger)

local log = Logger.new("Util")

local MAX_RETRY_ATTEMPTS = 5
local MAX_BACKOFF_S = 16

local Util = {}

-- Injected web-call failures for DevTools /simfail web n -- spec [43], [45]
local simulatedWebFailures = 0

-- returns x limited to [lo, hi]
function Util.clamp(x: number, lo: number, hi: number): number
	if x < lo then
		return lo
	elseif x > hi then
		return hi
	end
	return x
end

-- returns a + (b - a) * t
function Util.lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

-- returns t such that lerp(a, b, t) == x (0 when a == b)
function Util.inverseLerp(a: number, b: number, x: number): number
	if a == b then
		return 0
	end
	return (x - a) / (b - a)
end

-- returns x mapped from [inMin, inMax] onto [outMin, outMax] (unclamped)
function Util.remap(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number
	return Util.lerp(outMin, outMax, Util.inverseLerp(inMin, inMax, x))
end

-- returns current moved toward target by at most maxDelta
function Util.approach(current: number, target: number, maxDelta: number): number
	if current < target then
		return math.min(current + maxDelta, target)
	end
	return math.max(current - maxDelta, target)
end

-- frame-rate independent exponential smoothing; rate in 1/s, dt in s
function Util.expSmooth(current: number, target: number, rate: number, dt: number): number
	local alpha = 1 - math.exp(-rate * dt)
	return current + (target - current) * alpha
end

-- returns x rounded to the given number of decimals (default 0)
function Util.round(x: number, decimals: number?): number
	local scale = 10 ^ (decimals or 0)
	return math.floor(x * scale + 0.5) / scale
end

-- returns true for finite numbers only (rejects NaN and +/-inf)
function Util.isFiniteNumber(x: unknown): boolean
	if type(x) ~= "number" then
		return false
	end
	local n = x :: number
	return n == n and n ~= math.huge and n ~= -math.huge
end

-- returns "12,500" for 12500 (integer part, thousands separators)
function Util.formatNumber(x: number): string
	local negative = x < 0
	local digits = tostring(math.floor(math.abs(x) + 0.5))
	local formatted = digits:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if formatted:sub(1, 1) == "," then
		formatted = formatted:sub(2)
	end
	return if negative then "-" .. formatted else formatted
end

-- returns "$12,500" for 12500
function Util.formatCash(x: number): string
	if x < 0 then
		return "-$" .. Util.formatNumber(-x)
	end
	return "$" .. Util.formatNumber(x)
end

-- studsPerSec -> "47 MPH" or "75 KM/H"
function Util.formatSpeed(studsPerSec: number, useMph: boolean): string
	if useMph then
		return string.format("%d MPH", math.floor(Units.studsPerSecToMph(studsPerSec) + 0.5))
	end
	return string.format("%d KM/H", math.floor(Units.studsPerSecToKmh(studsPerSec) + 0.5))
end

local function deepCopyValue(value: unknown): unknown
	if type(value) ~= "table" then
		return value
	end
	local source = value :: { [unknown]: unknown }
	local copy: { [unknown]: unknown } = {}
	for k, v in source do
		copy[deepCopyValue(k)] = deepCopyValue(v)
	end
	return copy
end

-- returns an unfrozen deep copy (metatables are not copied)
function Util.deepCopy<T>(value: T): T
	return deepCopyValue(value) :: T
end

local function deepFreezeValue(value: unknown)
	if type(value) ~= "table" then
		return
	end
	local tbl = value :: { [unknown]: unknown }
	for _, v in tbl do
		deepFreezeValue(v)
	end
	if not table.isfrozen(tbl) then
		table.freeze(tbl)
	end
end

-- freezes the table and every nested table; returns it
function Util.deepFreeze<T>(value: T): T
	deepFreezeValue(value)
	return value
end

-- DevTools hook: the next n retryAsync attempts fail before calling fn
function Util.setSimulatedWebFailures(n: number)
	simulatedWebFailures = math.max(0, math.floor(n))
end

-- returns the number of injected failures still pending
function Util.getSimulatedWebFailures(): number
	return simulatedWebFailures
end

-- Runs fn under pcall with up to maxAttempts tries (default 5), waiting
-- min(2^(n-1), 16) s plus 0-50% jitter after failed attempt n. Yields.
-- returns (true, result) or (false, lastError)
function Util.retryAsync(label: string, fn: () -> unknown, maxAttempts: number?): (boolean, unknown)
	local attempts = maxAttempts or MAX_RETRY_ATTEMPTS
	local lastError: unknown = "no attempts made"
	for attempt = 1, attempts do
		local ok: boolean
		local result: unknown
		if simulatedWebFailures > 0 then
			simulatedWebFailures -= 1
			ok, result = false, "simulated web failure (DevTools /simfail)"
		else
			ok, result = pcall(fn)
		end
		if ok then
			if attempt > 1 then
				log:Info("%s succeeded on attempt %d", label, attempt)
			end
			return true, result
		end
		lastError = result
		if attempt < attempts then
			local base = math.min(2 ^ (attempt - 1), MAX_BACKOFF_S)
			task.wait(base * (1 + math.random() * 0.5))
		end
	end
	log:Error("%s failed after %d attempts: %s", label, attempts, tostring(lastError))
	return false, lastError
end

-- creates a WeldConstraint joining a and b (Parent set last); returns it
function Util.weld(a: BasePart, b: BasePart): WeldConstraint
	local weldConstraint = Instance.new("WeldConstraint")
	weldConstraint.Part0 = a
	weldConstraint.Part1 = b
	weldConstraint.Parent = a
	return weldConstraint
end

-- CollectionService tag names -- spec [41] and later sections
Util.Tags = table.freeze({
	Vehicle = "Vehicle",
	GasPump = "GasPump",
	ChargingStation = "ChargingStation",
	JobPickup = "JobPickup",
	JobDropoff = "JobDropoff",
	StreetLight = "StreetLight",
	TrafficLight = "TrafficLight",
	Checkpoint = "Checkpoint",
	Dealership = "Dealership",
	GaragePoint = "GaragePoint",
	AcademyStart = "AcademyStart",
	WashBay = "WashBay",
	Interior = "Interior",
	DeepMud = "DeepMud",
	DeepSand = "DeepSand",
	DeepSnow = "DeepSnow",
	RiverFlow = "RiverFlow",
	FoamPit = "FoamPit",
	KidsTrack = "KidsTrack",
	WaveZone = "WaveZone",
	SpeedTrap = "SpeedTrap",
	JumpZone = "JumpZone",
	SlideZone = "SlideZone",
	RepairBay = "RepairBay",
	GraffitiTag = "GraffitiTag",
	LostPart = "LostPart",
	Grindable = "Grindable",
	CameraIgnore = "CameraIgnore",
	AmbienceZone = "AmbienceZone",
	ReverbZone = "ReverbZone",
	Puddle = "Puddle",
	NeonSign = "NeonSign",
	NightWindow = "NightWindow",
	PedSignal = "PedSignal",
	CityZone = "CityZone",
	RaceStart = "RaceStart",
	TimeTrialStart = "TimeTrialStart",
	StuntZone = "StuntZone",
	SpectatorCam = "SpectatorCam",
	LeaderboardBoard = "LeaderboardBoard",
	WinchAnchor = "WinchAnchor",
	PedNode = "PedNode",
})

-- Attribute names (PascalCase, unit-suffixed for physical values) -- spec [41]
Util.Attr = table.freeze({
	ServerReady = "ServerReady",
	DebugLogging = "DebugLogging",
	UseMockData = "UseMockData",
	OwnerUserId = "OwnerUserId",
	DriverUserId = "DriverUserId",
	VehicleId = "VehicleId",
	ConfigVersion = "ConfigVersion",
	NetId = "NetId",
	Fuel_L = "Fuel_L",
	Charge_Wh = "Charge_Wh",
	Condition_pct = "Condition_pct",
	Power_kW = "Power_kW",
	DealershipId = "DealershipId",
	PropertyId = "PropertyId",
	AllowedClass = "AllowedClass",
	SiteId = "SiteId",
	Cash = "Cash",
	RepLevel = "RepLevel",
	RepXP = "RepXP",
	RaceId = "RaceId",
	RaceRole = "RaceRole",
})

return table.freeze(Util)
