--!strict
-- Util.spec: pure helper checks. -- spec [33], [482]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Units = require(ReplicatedStorage.Shared.Units)
local Util = require(ReplicatedStorage.Shared.Util)
local TestKit = require(script.Parent.TestKit)

local function smoothFor(fps: number): number
	local value = 0
	local dt = 1 / fps
	for _ = 1, fps do
		value = Util.expSmooth(value, 10, 3, dt)
	end
	return value
end

return function(t: TestKit.Api)
	t.describe("math", function()
		t.it("clamp/lerp/inverseLerp/remap", function()
			t.expect(Util.clamp(5, 0, 3)).toEqual(3)
			t.expect(Util.lerp(2, 4, 0.5)).toEqual(3)
			t.expect(Util.inverseLerp(2, 4, 3)).toEqual(0.5)
			t.expect(Util.remap(5, 0, 10, 100, 200)).toEqual(150)
		end)
		t.it("approach never overshoots", function()
			t.expect(Util.approach(0, 1, 5)).toEqual(1)
			t.expect(Util.approach(1, 0, 0.25)).toEqual(0.75)
		end)
		t.it("expSmooth is frame-rate independent within 0.1%", function()
			local at30 = smoothFor(30)
			local at60 = smoothFor(60)
			local at240 = smoothFor(240)
			t.expect(math.abs(at30 - at240) / at240 < 0.001).toBeTrue()
			t.expect(math.abs(at60 - at240) / at240 < 0.001).toBeTrue()
		end)
		t.it("round", function()
			t.expect(Util.round(1.2345, 2)).toBeNear(1.23, 1e-9)
		end)
		t.it("isFiniteNumber rejects NaN and inf", function()
			t.expect(Util.isFiniteNumber(0 / 0)).toBeFalse()
			t.expect(Util.isFiniteNumber(math.huge)).toBeFalse()
			t.expect(Util.isFiniteNumber(-math.huge)).toBeFalse()
			t.expect(Util.isFiniteNumber("1")).toBeFalse()
			t.expect(Util.isFiniteNumber(1.5)).toBeTrue()
		end)
	end)
	t.describe("formatting", function()
		t.it("formatNumber / formatCash", function()
			t.expect(Util.formatNumber(12500)).toEqual("12,500")
			t.expect(Util.formatNumber(1000000)).toEqual("1,000,000")
			t.expect(Util.formatNumber(999)).toEqual("999")
			t.expect(Util.formatCash(12500)).toEqual("$12,500")
		end)
		t.it("formatSpeed", function()
			t.expect(Util.formatSpeed(Units.kmhToStudsPerSec(75), false)).toEqual("75 KM/H")
			t.expect(Util.formatSpeed(Units.MPH_TO_SPS * 47, true)).toEqual("47 MPH")
		end)
	end)
	t.describe("tables", function()
		t.it("deepCopy copies nested tables", function()
			local source = { a = { b = 1 } }
			local copy = Util.deepCopy(source)
			copy.a.b = 2
			t.expect(source.a.b).toEqual(1)
		end)
		t.it("deepFreeze freezes nested tables", function()
			local frozen = Util.deepFreeze({ a = { b = 1 } })
			t.expect(table.isfrozen(frozen.a)).toBeTrue()
		end)
	end)
end
