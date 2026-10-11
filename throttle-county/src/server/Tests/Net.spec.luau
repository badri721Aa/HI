--!strict
-- Net.spec: compiled validators reject malformed payloads. -- spec [35], [482]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = require(ReplicatedStorage.Shared.Net)
local TestKit = require(script.Parent.TestKit)

return function(t: TestKit.Api)
	t.describe("Net.T", function()
		t.it("Shop_Buy accepts a valid call", function()
			t.expect((Net.T.Shop_Buy("volt_wasp_x", 1))).toBeTrue()
		end)
		t.it("Shop_Buy rejects NaN, wrong types, long strings and wrong counts", function()
			t.expect((Net.T.Shop_Buy("volt_wasp_x", 0 / 0))).toBeFalse()
			t.expect((Net.T.Shop_Buy(5, 1))).toBeFalse()
			t.expect((Net.T.Shop_Buy(string.rep("x", 10240), 1))).toBeFalse()
			t.expect((Net.T.Shop_Buy("volt_wasp_x"))).toBeFalse()
			t.expect((Net.T.Shop_Buy("volt_wasp_x", 1.5))).toBeFalse()
		end)
		t.it("Vehicle_State requires an exact 10-byte buffer", function()
			t.expect((Net.T.Vehicle_State(buffer.create(10)))).toBeTrue()
			t.expect((Net.T.Vehicle_State(buffer.create(11)))).toBeFalse()
		end)
		t.it("Vehicle_Crash rejects huge vectors", function()
			t.expect((Net.T.Vehicle_Crash("Bail", 10, Vector3.zero, Vector3.new(1e6, 0, 0), 1))).toBeFalse()
		end)
		t.it("rejects invalid utf8", function()
			t.expect((Net.T.Race_Join("\255\254"))).toBeFalse()
		end)
	end)
end
