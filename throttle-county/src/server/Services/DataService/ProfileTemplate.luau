--!strict
-- ProfileTemplate: defaults for new player saves, the per-vehicle template, the current data
-- version and the ordered migrations. -- spec [447], [453], [454], [455]
-- Nil is never used as a default (Reconcile cannot restore nil); empty strings and tables are.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Types = require(Shared.Types)
local Economy = require(Shared.Config.Economy)

local CURRENT_DATA_VERSION = 1

local settings: Types.PlayerSettings = {
	Version = 1,
	Units = "MPH",
	Graphics = "Auto",
	Palette = "Default",
	Audio = {
		Master = 100,
		Engines = 100,
		VehiclesSFX = 100,
		Ambience = 100,
		Music = 100,
		UI = 100,
		Radio = true,
		OtherRadios = true,
	},
	Camera = { BaseFOV = 70, Roll = 100, Shake = 60, AutoRecenter = true },
	HUD = { Scale = 100, Hidden = {} },
	ReduceMotion = "System",
	Vibration = "High",
	HoldToggle = { Clutch = "Hold", LookBack = "Hold" },
	Realism = "Light",
	StreetRules = false,
	AutoLights = true,
	AllowFriendJoin = true,
	TrafficDensity = 100,
	TireMarks = true,
	PostFX = true,
	Nameplates = "Everyone",
	StreamerMode = false,
	Assists = {},
	Controls = {},
}

local profile: Types.PlayerProfile = {
	DataVersion = CURRENT_DATA_VERSION,
	Cash = Economy.StartingCash,
	RepXP = 0,
	Level = 1,
	OwnedVehicles = {},
	Garage = {},
	Properties = {},
	Settings = settings,
	Stats = {},
	Achievements = {},
	Challenges = {
		DayIndex = 0,
		Daily = {},
		DailyDone = {},
		WeekIndex = 0,
		Weekly = {},
		WeeklyDone = {},
		RerollUsed = false,
		StreakDay = 0,
		LastClaimDay = 0,
	},
	Progress = {
		Mastery = {},
		Collectibles = {},
		FastTravel = {},
		Onboarding = {},
		JobDR = {},
	},
	Ratings = {},
	PersonalBests = {},
	RiderGear = { Owned = {}, Loadouts = {} },
	CrewId = "",
	Receipts = {},
	Ledger = {},
	LedgerHead = 0,
	Strikes = {},
	Flags = {},
}

local ownedVehicle: Types.OwnedVehicle = {
	Serial = "",
	VehicleId = "",
	Upgrades = {},
	OwnedParts = {},
	Visual = {},
	Tunes = {},
	ActiveTune = 0,
	Paint = {},
	Plate = "",
	NumberBoard = "",
	Odometer_km = 0,
	DamageState = {},
	Wear = {
		TreadF = 1,
		TreadR = 1,
		ChainLube = 1,
		ChainStretch = 0,
		PadsF = 1,
		PadsR = 1,
		OilHours = 0,
		AirFilter = 0,
		PackSoH = 1,
	},
	Fuel_L = 0,
	Charge_Wh = 0,
	TotalSpent = 0,
	AcquiredAt = 0,
}

-- Migrations[n] upgrades a version-n table to n+1. Pure: no yields, no web calls.
-- Version 1 is the first schema, so none exist yet; each later one gets a /selftest fixture.
local migrations: { [number]: (data: { [string]: unknown }) -> () } = {}

local ProfileTemplate = {
	CURRENT_DATA_VERSION = CURRENT_DATA_VERSION,
	Profile = profile,
	OwnedVehicle = ownedVehicle,
	Migrations = migrations,
}

return ProfileTemplate
