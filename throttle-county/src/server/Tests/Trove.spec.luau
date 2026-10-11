--!strict
-- Trove.spec: cleanup order and type dispatch. -- spec [31], [482]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Signal = require(ReplicatedStorage.Shared.Signal)
local Trove = require(ReplicatedStorage.Shared.Trove)
local TestKit = require(script.Parent.TestKit)

return function(t: TestKit.Api)
	t.describe("Clean", function()
		t.it("runs in reverse insertion order", function()
			local trove = Trove.new()
			local order: { number } = {}
			trove:Add(function()
				table.insert(order, 1)
			end)
			trove:Add(function()
				table.insert(order, 2)
			end)
			trove:Clean()
			t.expect(order[1]).toEqual(2)
			t.expect(order[2]).toEqual(1)
		end)
		t.it("destroys instances and disconnects signals", function()
			local trove = Trove.new()
			local folder = trove:Add(Instance.new("Folder"))
			folder.Parent = workspace
			local signal = Signal.new()
			local fired = 0
			trove:Connect(signal, function()
				fired += 1
			end)
			trove:Clean()
			signal:Fire()
			t.expect(folder.Parent == nil).toBeTrue()
			t.expect(fired).toEqual(0)
		end)
		t.it("child troves clean with the parent", function()
			local trove = Trove.new()
			local child = trove:Extend()
			local cleaned = false
			child:Add(function()
				cleaned = true
			end)
			trove:Destroy()
			t.expect(cleaned).toBeTrue()
		end)
	end)
end
