--!strict
-- Economy.spec: the Rep XP curve constants reproduce the canon table. -- spec [341], [482]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Economy = require(ReplicatedStorage.Shared.Config.Economy)
local TestKit = require(script.Parent.TestKit)

local function xpToNext(level: number): number
	local rep = Economy.Rep
	return math.floor(rep.Base + rep.Coef * level ^ rep.Exponent + 0.5)
end

local function cumulativeTo(level: number): number
	local total = 0
	for l = 1, level - 1 do
		total += xpToNext(l)
	end
	return total
end

return function(t: TestKit.Api)
	t.describe("Rep curve", function()
		t.it("XPToNext matches the canon table", function()
			local expected = { [1] = 370, [2] = 578, [5] = 1488, [10] = 3632, [20] = 9490, [25] = 13020, [50] = 35139, [75] = 63059, [99] = 94190 }
			for level, xp in expected do
				t.expect(xpToNext(level)).toEqual(xp)
			end
		end)
		t.it("cumulative XP matches the canon table", function()
			t.expect(cumulativeTo(10)).toEqual(14401)
			t.expect(cumulativeTo(25)).toEqual(129980)
			t.expect(cumulativeTo(50)).toEqual(706906)
			t.expect(cumulativeTo(60)).toEqual(1105092)
			t.expect(cumulativeTo(100)).toEqual(3867789)
		end)
		t.it("starting cash is $2,500", function()
			t.expect(Economy.StartingCash).toEqual(2500)
		end)
	end)
end
