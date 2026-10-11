--!strict
-- ConfigValidator: checks every vehicle config before any Service Init and reports all
-- problems at once. Studio halts boot with error(); live servers hide invalid vehicles. -- spec [39]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Types = require(Shared.Types)
local Util = require(Shared.Util)
local Economy = require(Shared.Config.Economy)
local AssetIds = require(Shared.Config.AssetIds)
local SoundIds = require(Shared.Config.SoundIds)

local log = Logger.new("ConfigValidator")

-- field type codes: n number, s string, b boolean, t:<Schema> nested table,
-- a array of numbers, r array of number rows, m:<Schema> array of nested tables, sa array of strings.
-- A trailing "!" marks a required field.
type Schema = { [string]: string }

local SCHEMAS: { [string]: Schema } = {
	Identity = { VehicleId = "s!", DisplayName = "s!", Brand = "s!", Class = "s!" },
	Economy = { Price = "n!", UnlockLevel = "n!", Dealership = "s!" },
	Dimensions = {
		Wheelbase_mm = "n",
		Length_mm = "n",
		Width_mm = "n",
		Height_mm = "n",
		SeatHeight_mm = "n",
		WheelDiaF_mm = "n",
		WheelDiaR_mm = "n",
		BarWidth_mm = "n",
		TrackF_mm = "n",
		TrackR_mm = "n",
		DeckHeight_mm = "n",
		RampLength_mm = "n",
	},
	Mass = { Mass_kg = "n!", CoMHeight_mm = "n", GVWR_kg = "n" },
	Chassis = {
		Rake_deg = "n",
		Trail_mm = "n",
		SteerLock_deg = "n",
		MaxLean_deg = "n",
		ScrapeLean_deg = "n",
		BrakeTorqueF_Nm = "n",
		BrakeTorqueR_Nm = "n",
		BrakeBiasF_x = "n",
		SteeringDamper = "n",
		AirPitchTorque_Nm = "n",
		CdA_m2 = "n",
		AckermannFactor = "n",
		AntiRollF_Nmm = "n",
		AntiRollR_Nmm = "n",
	},
	Suspension = {
		TravelF_mm = "n",
		TravelR_mm = "n",
		SpringRateF_Nmm = "n",
		SpringRateR_Nmm = "n",
		PreloadF_mm = "n",
		PreloadR_mm = "n",
		ProgressionF = "n",
		ProgressionR = "n",
		SagTargetF_pct = "n",
		SagTargetR_pct = "n",
		LeverageRatio = "n",
		Adjusters = "s",
	},
	Tires = {
		FrontCompound = "s!",
		RearCompound = "s!",
		WidthF_mm = "n",
		WidthR_mm = "n",
		PressureF_kPa = "n",
		PressureR_kPa = "n",
		GripMul = "n",
	},
	Powertrain = {
		Kind = "s!",
		PeakPower_kW = "n!",
		PeakTorque_Nm = "n",
		TopSpeed_kmh = "n!",
		DescentCap_kmh = "n",
		Target0to50_s = "n",
		Target0to25_s = "n",
		WadeDepth_mm = "n",
		Electric = "t:Electric",
		Engine = "t:Engine",
		Clutch = "t:Clutch",
		Gearbox = "t:Gearbox",
		Cvt = "t:Cvt",
		Fuel = "t:Fuel",
		Pedal = "t:Pedal",
		Driveline = "t:Driveline",
	},
	Electric = {
		Pack_V = "n!",
		Capacity_Ah = "n!",
		Capacity_Wh = "n!",
		PackFull_V = "n",
		PackEmpty_V = "n",
		MotorRef_V = "n",
		Pack_ohm = "n",
		MaxDischarge_A = "n",
		PhaseCurrent_A = "n",
		BatteryCurrent_A = "n",
		RegenCurrent_A = "n",
		Reduction_x = "n",
		FieldWeakening_x = "n",
		MaxSpeed_rpm = "n",
		MaxCharge_kW = "n",
		RatedRange_km = "n",
		RideModes = "m:RideMode",
	},
	RideMode = {
		Name = "s!",
		PowerScale_x = "n!",
		CurrentScale_x = "n",
		SpeedCap_kmh = "n!",
		ThrottleMap = "s!",
		ThrottleRamp_ms = "n",
		RegenScale_x = "n",
	},
	Engine = {
		Inertia_kgm2 = "n!",
		Idle_rpm = "n!",
		Redline_rpm = "n!",
		Limiter = "s!",
		StartType = "s!",
		TorqueCurve = "r!",
		PeakTorque_rpm = "n",
		PeakPower_rpm = "n",
	},
	Clutch = { Type = "s!", Capacity_Nm = "n" },
	Gearbox = { Ratios_x = "a!", Primary_x = "n!", FinalDrive_x = "n!", ShiftTime_s = "n", Quickshifter = "b" },
	Cvt = { Engage_rpm = "n!", RatioLow_x = "n!", RatioHigh_x = "n!", FinalDrive_x = "n" },
	Fuel = { FuelType = "s!", Tank_L = "n!", PremixRatio = "n", OilTank_L = "n" },
	Pedal = { ChainringTeeth = "a", CassetteTeeth = "a", Crank_mm = "n", Fixed = "b" },
	Driveline = { Type = "s!", Efficiency_x = "n!" },
	Assists = { TractionControl = "b", ABS = "b", WheelieControl = "b", LaunchControl = "b", CorneringABS = "b" },
	Audio = { Profile = "s!", EqPreset = "s", BaseVolume = "n", RollOffClass = "s", PolePairs = "n" },
	Visual = { Model = "s!", FactoryColors = "sa", HeadlightOnFork = "b" },
	Seats = {
		Riders = "n!",
		Passengers = "n!",
		RiderStance = "s",
		Cargo_L = "n",
		Payload_kg = "n",
		BikeSlots = "n",
	},
}

local GROUPS = {
	"Identity",
	"Economy",
	"Dimensions",
	"Mass",
	"Chassis",
	"Suspension",
	"Tires",
	"Powertrain",
	"Assists",
	"Audio",
	"Visual",
	"Seats",
}

-- spec [39], [84] (_C _JpK _KpW _Wprad) and [68] (_m2 for CdA)
local ALLOWED_SUFFIXES = {
	"_kg",
	"_kW",
	"_Nm",
	"_Nmm",
	"_mm",
	"_m",
	"_km",
	"_kmh",
	"_mps",
	"_Wh",
	"_Ah",
	"_V",
	"_A",
	"_ohm",
	"_deg",
	"_rpm",
	"_cc",
	"_L",
	"_s",
	"_ms",
	"_N",
	"_Ns",
	"_kPa",
	"_kgm2",
	"_pct",
	"_x",
	"_C",
	"_JpK",
	"_KpW",
	"_Wprad",
	"_m2",
}

local DIMENSIONLESS_EXACT: { [string]: boolean } = {
	Price = true,
	UnlockLevel = true,
	Riders = true,
	Passengers = true,
	PolePairs = true,
	BikeSlots = true,
	SteeringDamper = true,
	AckermannFactor = true,
	BaseVolume = true,
}

local DIMENSIONLESS_PATTERNS = { "Mul$", "Ratio$", "^Progression", "Teeth$" }

-- [60] compound rows
local COMPOUNDS: { [string]: boolean } = {
	StreetSport = true,
	Touring = true,
	MXIntermediate = true,
	MXSoft = true,
	SandPaddle = true,
	Mud = true,
	Trials = true,
	Slick = true,
	SnowStudded = true,
	KnobbyATV = true,
}

local KINDS: { [string]: boolean } = { Pedal = true, Electric = true, Gas2T = true, Gas4T = true, Diesel = true }

local RANGES: { [string]: { number } } = {
	Mass_kg = { 5, 4000 },
	Price = { 0, 100000 },
	UnlockLevel = { 1, 100 },
	TopSpeed_kmh = { 10, 320 },
}

export type Result = {
	Valid: { [string]: Types.VehicleConfig },
	Invalid: { [string]: boolean },
	ErrorCount: number,
}

local ConfigValidator = {
	Name = "ConfigValidator",
	LastResult = nil :: Result?,
}

local function hasAllowedSuffix(field: string): boolean
	if DIMENSIONLESS_EXACT[field] then
		return true
	end
	for _, pattern in DIMENSIONLESS_PATTERNS do
		if string.find(field, pattern) ~= nil then
			return true
		end
	end
	for _, suffix in ALLOWED_SUFFIXES do
		if string.sub(field, -#suffix) == suffix then
			return true
		end
	end
	return false
end

local validateTable: (tbl: { [string]: unknown }, schemaName: string, path: string, errors: { string }) -> ()

local function validateNumber(key: string, value: unknown, fieldPath: string, errors: { string })
	if not Util.isFiniteNumber(value) then
		table.insert(errors, string.format("%s: expected finite number", fieldPath))
	elseif not hasAllowedSuffix(key) then
		table.insert(errors, string.format("%s: numeric field lacks an allowed unit suffix", fieldPath))
	else
		local range = RANGES[key]
		local n = value :: number
		if range ~= nil and (n < range[1] or n > range[2]) then
			table.insert(errors, string.format("%s: %s outside %s-%s", fieldPath, tostring(n), tostring(range[1]), tostring(range[2])))
		end
	end
end

local function validateArray(key: string, kind: string, value: unknown, fieldPath: string, errors: { string })
	if type(value) ~= "table" then
		table.insert(errors, string.format("%s: expected array", fieldPath))
		return
	end
	local want = if kind == "a" then "number" else "string"
	for i, item in value :: { unknown } do
		if type(item) ~= want or (want == "number" and not Util.isFiniteNumber(item)) then
			table.insert(errors, string.format("%s[%d]: expected %s", fieldPath, i, want))
		end
	end
	if kind == "a" and not hasAllowedSuffix(key) then
		table.insert(errors, string.format("%s: numeric field lacks an allowed unit suffix", fieldPath))
	end
end

local function validateRows(value: unknown, fieldPath: string, errors: { string })
	if type(value) ~= "table" then
		table.insert(errors, string.format("%s: expected array of rows", fieldPath))
		return
	end
	for i, row in value :: { unknown } do
		if type(row) ~= "table" then
			table.insert(errors, string.format("%s[%d]: expected row table", fieldPath, i))
			continue
		end
		for j, cell in row :: { unknown } do
			if not Util.isFiniteNumber(cell) then
				table.insert(errors, string.format("%s[%d][%d]: expected finite number", fieldPath, i, j))
			end
		end
	end
end

local function validateNested(kind: string, value: unknown, fieldPath: string, errors: { string })
	local schemaName = string.sub(kind, 3)
	if type(value) ~= "table" then
		table.insert(errors, string.format("%s: expected table", fieldPath))
		return
	end
	if string.sub(kind, 1, 2) == "t:" then
		validateTable(value :: { [string]: unknown }, schemaName, fieldPath, errors)
		return
	end
	for i, item in value :: { unknown } do
		if type(item) ~= "table" then
			table.insert(errors, string.format("%s[%d]: expected table", fieldPath, i))
		else
			validateTable(item :: { [string]: unknown }, schemaName, string.format("%s[%d]", fieldPath, i), errors)
		end
	end
end

local function validateField(key: string, kind: string, value: unknown, fieldPath: string, errors: { string })
	if kind == "n" then
		validateNumber(key, value, fieldPath, errors)
	elseif kind == "s" or kind == "b" then
		local want = if kind == "s" then "string" else "boolean"
		if type(value) ~= want then
			table.insert(errors, string.format("%s: expected %s", fieldPath, want))
		end
	elseif kind == "a" or kind == "sa" then
		validateArray(key, kind, value, fieldPath, errors)
	elseif kind == "r" then
		validateRows(value, fieldPath, errors)
	else
		validateNested(kind, value, fieldPath, errors)
	end
end

function validateTable(tbl: { [string]: unknown }, schemaName: string, path: string, errors: { string })
	local schema = SCHEMAS[schemaName]
	for key, code in schema do
		if string.sub(code, -1) == "!" and tbl[key] == nil then
			table.insert(errors, string.format("%s.%s: required field missing", path, key))
		end
	end
	for rawKey, value in tbl do
		local key = tostring(rawKey)
		local fieldPath = path .. "." .. key
		local code = schema[key]
		if code == nil then
			table.insert(errors, string.format("%s: unknown key", fieldPath))
		else
			validateField(key, (string.gsub(code, "!$", "")), value, fieldPath, errors)
		end
	end
end

local function crossCheck(config: Types.VehicleConfig, fileName: string, errors: { string })
	local id = config.Identity.VehicleId
	if id ~= fileName then
		table.insert(errors, string.format("%s.Identity.VehicleId: '%s' does not match file name", fileName, tostring(id)))
	end
	if string.match(id, "^[a-z0-9_]+$") == nil then
		table.insert(errors, string.format("%s.Identity.VehicleId: must match ^[a-z0-9_]+$", fileName))
	end
	if Economy.Dealerships[config.Economy.Dealership] == nil then
		table.insert(errors, string.format("%s.Economy.Dealership: unknown dealership '%s'", fileName, config.Economy.Dealership))
	end
	if not KINDS[config.Powertrain.Kind] then
		table.insert(errors, string.format("%s.Powertrain.Kind: unknown kind '%s'", fileName, tostring(config.Powertrain.Kind)))
	end
	if not COMPOUNDS[config.Tires.FrontCompound] then
		table.insert(errors, string.format("%s.Tires.FrontCompound: unknown compound '%s'", fileName, config.Tires.FrontCompound))
	end
	if not COMPOUNDS[config.Tires.RearCompound] then
		table.insert(errors, string.format("%s.Tires.RearCompound: unknown compound '%s'", fileName, config.Tires.RearCompound))
	end
	local gearbox = config.Powertrain.Gearbox
	if gearbox ~= nil then
		local ratios = gearbox.Ratios_x
		for i = 2, #ratios do
			if ratios[i] >= ratios[i - 1] then
				table.insert(errors, string.format("%s.Powertrain.Gearbox.Ratios_x: must strictly decrease (index %d)", fileName, i))
				break
			end
		end
	end
	local electric = config.Powertrain.Electric
	if electric ~= nil then
		local product = electric.Pack_V * electric.Capacity_Ah
		if product > 0 and math.abs(electric.Capacity_Wh - product) / product > 0.02 then
			table.insert(errors, string.format("%s.Powertrain.Electric.Capacity_Wh: not within 2%% of Pack_V x Capacity_Ah (%s)", fileName, tostring(product)))
		end
	end
	if not SoundIds.has("Engines." .. config.Audio.Profile) and not SoundIds.has("Electric." .. config.Audio.Profile) then
		table.insert(errors, string.format("%s.Audio.Profile: no SoundIds entry '%s'", fileName, config.Audio.Profile))
	end
	if not AssetIds.has("Vehicles." .. config.Visual.Model) then
		table.insert(errors, string.format("%s.Visual.Model: no AssetIds entry '%s'", fileName, config.Visual.Model))
	end
end

-- Validates every ModuleScript in Shared/Config/Vehicles. Errors in Studio; returns the result.
function ConfigValidator.Run(): Result
	local result: Result = { Valid = {}, Invalid = {}, ErrorCount = 0 }
	local allErrors: { string } = {}
	local folder = Shared.Config:FindFirstChild("Vehicles")
	if folder == nil then
		table.insert(allErrors, "Config.Vehicles: folder missing (create an empty Folder named Vehicles in Shared/Config)")
	else
		for _, module in folder:GetChildren() do
			if not module:IsA("ModuleScript") then
				continue
			end
			local fileErrors: { string } = {}
			local ok, loaded = pcall(require, module)
			if not ok then
				table.insert(fileErrors, string.format("%s: require failed: %s", module.Name, tostring(loaded)))
			elseif type(loaded) ~= "table" then
				table.insert(fileErrors, string.format("%s: module must return a table", module.Name))
			else
				local tbl = loaded :: { [string]: unknown }
				for _, group in GROUPS do
					local value = tbl[group]
					if type(value) ~= "table" then
						table.insert(fileErrors, string.format("%s.%s: group missing", module.Name, group))
					else
						validateTable(value :: { [string]: unknown }, group, module.Name .. "." .. group, fileErrors)
					end
				end
				for key in tbl do
					if SCHEMAS[tostring(key)] == nil or table.find(GROUPS, tostring(key)) == nil then
						table.insert(fileErrors, string.format("%s.%s: unknown group", module.Name, tostring(key)))
					end
				end
				if #fileErrors == 0 then
					crossCheck((tbl :: unknown) :: Types.VehicleConfig, module.Name, fileErrors)
				end
			end
			if #fileErrors == 0 then
				result.Valid[module.Name] = (loaded :: unknown) :: Types.VehicleConfig
			else
				result.Invalid[module.Name] = true
				for _, line in fileErrors do
					table.insert(allErrors, line)
				end
			end
		end
	end
	result.ErrorCount = #allErrors
	ConfigValidator.LastResult = result
	if #allErrors > 0 then
		local block = "ConfigValidator found " .. #allErrors .. " problem(s):\n" .. table.concat(allErrors, "\n")
		if RunService:IsStudio() then
			error(block, 0)
		end
		log:Error("%s", block)
	end
	return result
end

return ConfigValidator
