--!strict
-- Net/Validators: compiles NetDefs argument spec tuples into validator functions (Net.T).
-- Checks exact count and typeof, finite in-range numbers, UTF-8 strings under the cap, finite
-- Vector3 up to 12,000 studs, Instances by class and container, exact buffer length. -- spec [35]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Types = require(script.Parent.Parent.Types)
local Util = require(script.Parent.Parent.Util)

local MAX_VECTOR_MAGNITUDE = 12000

type ArgCheck = (value: unknown) -> (string?, string?) -- (failureKind "type"|"range", reason)
export type Validator = (...any) -> (boolean, string?, string?)

local Validators = {}

local function compileNumber(spec: Types.ArgSpec): ArgCheck
	local minValue = spec[2] :: number
	local maxValue = spec[3] :: number
	local integer = spec[4] == true
	return function(v: unknown): (string?, string?)
		if type(v) ~= "number" then
			return "type", "expected number"
		end
		if not Util.isFiniteNumber(v) then
			return "range", "non-finite number"
		end
		local n = v :: number
		if n < minValue or n > maxValue then
			return "range", "number out of range"
		end
		if integer and math.floor(n) ~= n then
			return "range", "expected integer"
		end
		return nil, nil
	end
end

local function compileString(spec: Types.ArgSpec): ArgCheck
	local maxLen = spec[2] :: number
	return function(v: unknown): (string?, string?)
		if type(v) ~= "string" then
			return "type", "expected string"
		end
		local s = v :: string
		if #s > maxLen then
			return "range", "string too long"
		end
		if utf8.len(s) == nil then
			return "range", "invalid utf8"
		end
		return nil, nil
	end
end

local function compileEnum(spec: Types.ArgSpec): ArgCheck
	local allowed: { [string]: boolean } = {}
	for _, option in spec[2] :: { string } do
		allowed[option] = true
	end
	return function(v: unknown): (string?, string?)
		if type(v) ~= "string" then
			return "type", "expected enum string"
		end
		if not allowed[v :: string] then
			return "range", "unknown enum value"
		end
		return nil, nil
	end
end

local function compileVector3(spec: Types.ArgSpec): ArgCheck
	local maxMag = math.min(spec[2] :: number, MAX_VECTOR_MAGNITUDE)
	return function(v: unknown): (string?, string?)
		if typeof(v) ~= "Vector3" then
			return "type", "expected Vector3"
		end
		local vec = v :: Vector3
		if not (Util.isFiniteNumber(vec.X) and Util.isFiniteNumber(vec.Y) and Util.isFiniteNumber(vec.Z)) then
			return "range", "non-finite Vector3"
		end
		if vec.Magnitude > maxMag then
			return "range", "Vector3 too large"
		end
		return nil, nil
	end
end

local function compileInstance(spec: Types.ArgSpec): ArgCheck
	local className = spec[2] :: string
	local containerName = spec[3] :: string
	return function(v: unknown): (string?, string?)
		if typeof(v) ~= "Instance" then
			return "type", "expected Instance"
		end
		local inst = v :: Instance
		if not inst:IsA(className) then
			return "type", "wrong class"
		end
		local container: Instance = if containerName == "Workspace" then workspace else ReplicatedStorage
		if not inst:IsDescendantOf(container) then
			return "range", "outside container"
		end
		return nil, nil
	end
end

local function compileBuffer(spec: Types.ArgSpec): ArgCheck
	local bytes = spec[2] :: number
	return function(v: unknown): (string?, string?)
		if typeof(v) ~= "buffer" then
			return "type", "expected buffer"
		end
		if buffer.len(v :: buffer) ~= bytes then
			return "range", "wrong buffer length"
		end
		return nil, nil
	end
end

local function checkBoolean(v: unknown): (string?, string?)
	if type(v) ~= "boolean" then
		return "type", "expected boolean"
	end
	return nil, nil
end

local function compileArg(spec: Types.ArgSpec): ArgCheck
	local kind = spec[1]
	if kind == "number" then
		return compileNumber(spec)
	elseif kind == "string" then
		return compileString(spec)
	elseif kind == "enum" then
		return compileEnum(spec)
	elseif kind == "vector3" then
		return compileVector3(spec)
	elseif kind == "instance" then
		return compileInstance(spec)
	elseif kind == "buffer" then
		return compileBuffer(spec)
	elseif kind == "boolean" then
		return checkBoolean
	end
	error(string.format("NetDefs: unknown arg spec kind '%s'", tostring(kind)))
end

-- returns a validator: (...) -> (ok, failureKind?, reason?)
function Validators.compile(def: Types.NetDef): Validator
	local checks: { ArgCheck } = {}
	for i, spec in def.Args do
		checks[i] = compileArg(spec)
	end
	local expected = #checks
	return function(...: any): (boolean, string?, string?)
		local count = select("#", ...)
		if count ~= expected then
			return false, "type", "wrong argument count"
		end
		for i = 1, expected do
			local failKind, reason = checks[i]((select(i, ...)))
			if failKind ~= nil then
				return false, failKind, reason
			end
		end
		return true, nil, nil
	end
end

return table.freeze(Validators)
