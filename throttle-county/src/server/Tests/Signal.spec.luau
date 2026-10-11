--!strict
-- Signal.spec: error isolation and safe disconnection. -- spec [30], [482]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Signal = require(ReplicatedStorage.Shared.Signal)
local TestKit = require(script.Parent.TestKit)

return function(t: TestKit.Api)
	t.describe("Fire", function()
		t.it("a throwing handler does not block the others", function()
			local signal = Signal.new()
			local ran = 0
			signal:Connect(function()
				ran += 1
			end)
			signal:Connect(function()
				error("intentional /selftest error (expected once in Output)")
			end)
			signal:Connect(function()
				ran += 1
			end)
			signal:Fire()
			t.expect(ran).toEqual(2)
			signal:Destroy()
		end)
		t.it("disconnecting during Fire is safe", function()
			local signal = Signal.new()
			local count = 0
			local connection
			connection = signal:Connect(function()
				count += 1
				connection:Disconnect()
			end)
			signal:Connect(function()
				count += 1
			end)
			signal:Fire()
			signal:Fire()
			t.expect(count).toEqual(3)
			t.expect(connection.Connected).toBeFalse()
		end)
		t.it("Once runs a single time", function()
			local signal = Signal.new()
			local count = 0
			signal:Once(function()
				count += 1
			end)
			signal:Fire()
			signal:Fire()
			t.expect(count).toEqual(1)
		end)
	end)
end
