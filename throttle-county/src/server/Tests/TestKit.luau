--!strict
-- TestKit: a tiny describe/it/expect runner for the *.spec ModuleScripts in this folder,
-- executed only by DevTools /selftest in Studio. -- spec [482]

export type Expectation = {
	toEqual: (expected: unknown) -> (),
	toBeNear: (expected: number, tolerance: number) -> (),
	toBeTrue: () -> (),
	toBeFalse: () -> (),
}

export type Api = {
	describe: (name: string, body: () -> ()) -> (),
	it: (name: string, body: () -> ()) -> (),
	expect: (value: unknown) -> Expectation,
}

export type Report = { Passed: number, Failed: number, Failures: { string } }

local TestKit = {}

local function expect(value: unknown): Expectation
	local expectation: Expectation = {
		toEqual = function(expected: unknown)
			if value ~= expected then
				error(string.format("expected %s, got %s", tostring(expected), tostring(value)), 2)
			end
		end,
		toBeNear = function(expected: number, tolerance: number)
			if type(value) ~= "number" or math.abs((value :: number) - expected) > tolerance then
				error(string.format("expected %s +/- %s, got %s", tostring(expected), tostring(tolerance), tostring(value)), 2)
			end
		end,
		toBeTrue = function()
			if value ~= true then
				error(string.format("expected true, got %s", tostring(value)), 2)
			end
		end,
		toBeFalse = function()
			if value ~= false then
				error(string.format("expected false, got %s", tostring(value)), 2)
			end
		end,
	}
	return expectation
end

-- runs one spec function; returns pass/fail counts and failure lines
function TestKit.run(specName: string, spec: (Api) -> (), report: Report)
	local scope: { string } = { specName }
	local api: Api = {
		describe = function(name: string, body: () -> ())
			table.insert(scope, name)
			body()
			table.remove(scope)
		end,
		it = function(name: string, body: () -> ())
			local failure: string? = nil
			xpcall(body, function(message: unknown)
				failure = tostring(message)
			end)
			if failure == nil then
				report.Passed += 1
			else
				report.Failed += 1
				table.insert(report.Failures, table.concat(scope, " > ") .. " > " .. name .. ": " .. failure)
			end
		end,
		expect = expect,
	}
	xpcall(spec, function(message: unknown)
		report.Failed += 1
		table.insert(report.Failures, specName .. ": spec errored: " .. tostring(message))
	end, api)
end

return TestKit
