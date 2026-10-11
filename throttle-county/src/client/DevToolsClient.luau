--!strict
-- DevToolsClient: Studio-only DEV button and command bar; prints server replies and the
-- Data_Snapshot summary. Required by Main.client only when RunService:IsStudio(). -- spec [45]
-- Debug UI only: it uses default Roblox styling until the Theme/UIKit system lands in Phase 12.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Logger = require(Shared.Logger)
local Net = require(Shared.Net)
local Trove = require(Shared.Trove)
local Types = require(Shared.Types)
local Util = require(Shared.Util)

local log = Logger.new("DevToolsClient")

local GUI_DISPLAY_ORDER = 90

local DevToolsClient = {
	Name = "DevToolsClient",
	_trove = Trove.new(),
	_output = nil :: TextLabel?,
}

local function showReply(text: string)
	print("[TC][C][DevTools] " .. text)
	local output = DevToolsClient._output
	if output ~= nil then
		output.Text = text
	end
end

local function summarizeSnapshot(snapshot: unknown)
	if type(snapshot) ~= "table" then
		return
	end
	local data = snapshot :: { [string]: unknown }
	local cash = data.Cash
	local vehicles = data.OwnedVehicles
	local ids: { string } = {}
	if type(vehicles) == "table" then
		for _, vehicle in vehicles :: { [string]: unknown } do
			if type(vehicle) == "table" then
				local vehicleId = (vehicle :: { [string]: unknown }).VehicleId
				if type(vehicleId) == "string" then
					table.insert(ids, vehicleId)
				end
			end
		end
	end
	local cashText = if type(cash) == "number" then Util.formatCash(cash :: number) else "?"
	showReply(string.format("Data_Snapshot: Cash %s, vehicles: %s", cashText, table.concat(ids, ", ")))
end

local function buildGui(): ScreenGui
	local gui = Instance.new("ScreenGui")
	gui.Name = "DevTools"
	gui.ResetOnSpawn = false
	gui.DisplayOrder = GUI_DISPLAY_ORDER
	gui.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets

	local button = Instance.new("TextButton")
	button.Name = "DevButton"
	button.Text = "DEV"
	button.Size = UDim2.fromOffset(56, 44)
	button.Position = UDim2.new(0, 8, 0.5, -22)
	button.Parent = gui

	local box = Instance.new("TextBox")
	box.Name = "CommandBar"
	box.PlaceholderText = "/help"
	box.Text = ""
	box.ClearTextOnFocus = false
	box.Size = UDim2.fromOffset(420, 44)
	box.Position = UDim2.new(0, 72, 0.5, -22)
	box.TextXAlignment = Enum.TextXAlignment.Left
	box.Visible = false
	box.Parent = gui

	local output = Instance.new("TextLabel")
	output.Name = "Output"
	output.Text = ""
	output.TextWrapped = true
	output.Size = UDim2.fromOffset(420, 60)
	output.Position = UDim2.new(0, 72, 0.5, 26)
	output.TextXAlignment = Enum.TextXAlignment.Left
	output.TextYAlignment = Enum.TextYAlignment.Top
	output.BackgroundTransparency = 0.3
	output.Visible = false
	output.Parent = gui
	DevToolsClient._output = output

	DevToolsClient._trove:Connect(button.Activated, function()
		box.Visible = not box.Visible
		output.Visible = box.Visible
		if box.Visible then
			box:CaptureFocus()
		end
	end)
	DevToolsClient._trove:Connect(box.FocusLost, function(enterPressed: boolean)
		if not enterPressed then
			return
		end
		local text = string.sub(box.Text, 1, 256)
		if text ~= "" then
			Net.Fire("Dev_Command", text)
		end
	end)
	return gui
end

-- wiring only
function DevToolsClient:Init(_registry: Types.Registry)
	log:Debug("DevTools client enabled (Studio)")
end

-- builds the DEV button and listens for replies and the data snapshot
function DevToolsClient:Start()
	local trove = DevToolsClient._trove
	local replyConnection = Net.On("Dev_Reply", function(text: unknown)
		showReply(tostring(text))
	end)
	if replyConnection ~= nil then
		trove:Add(replyConnection)
	end
	local snapshotConnection = Net.On("Data_Snapshot", summarizeSnapshot)
	if snapshotConnection ~= nil then
		trove:Add(snapshotConnection)
	end
	local playerGui = Players.LocalPlayer:FindFirstChildOfClass("PlayerGui")
	if playerGui == nil then
		log:Warn("PlayerGui missing; DEV button not shown")
		return
	end
	local gui = trove:Add(buildGui())
	gui.Parent = playerGui
end

return DevToolsClient
