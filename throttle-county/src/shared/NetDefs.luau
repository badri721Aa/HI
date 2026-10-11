--!strict
-- NetDefs: every remote in the game, its kind, direction, argument specs and rate. -- spec [34], [35]
-- Names follow Domain_Action. Arg specs are plain tuples compiled by Net into Net.T validators:
--   {"number", min, max, integer?}  {"string", maxLen}  {"enum", {...}}  {"vector3", maxMag}
--   {"instance", className, "Workspace"}  {"buffer", bytes}  {"boolean"}
-- Tables never travel raw: structured payloads are JSON strings with a length cap.
-- Rate = requests allowed per Per seconds (Per defaults to 1); only ToServer/Both are limited.

local Types = require(script.Parent.Types)

local REQUEST_ID: Types.ArgSpec = { "string", 40 }
local SERIAL: Types.ArgSpec = { "string", 64 }
local ID: Types.ArgSpec = { "string", 64 }

local CRASH_REASONS = {
	"HullImpact",
	"CasedLanding",
	"LowSide",
	"HighSide",
	"LoopOut",
	"Endo",
	"Headshake",
	"Rollover",
	"TipOver",
	"UpsideDown",
	"Submerged",
	"Bail",
	"Cutoff",
}

local defs: { [string]: Types.NetDef } = {
	-- Player / data ---------------------------------------------------------
	Player_Ready = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 1, Per = 5 },
	Data_Snapshot = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Data_Patch = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Settings_Save = { Kind = "Event", Direction = "ToServer", Args = { { "string", 4096 } }, Rate = 1, Per = 2 },
	Log_ClientError = { Kind = "Event", Direction = "ToServer", Args = { { "string", 300 } }, Rate = 5, Per = 60 },

	-- Vehicles ------------------------------------------------------------------
	Vehicle_Spawn = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, ID }, Rate = 2, Per = 5 },
	Vehicle_Enter = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "instance", "Model", "Workspace" }, { "enum", { "Driver", "Passenger" } } },
		Rate = 2,
	},
	Vehicle_Exit = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 2 },
	Vehicle_State = { Kind = "Unreliable", Direction = "Both", Args = { { "buffer", 10 } }, Rate = 20 },
	Vehicle_Notice = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Vehicle_Reset = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 1 },
	Vehicle_Crash = {
		Kind = "Event",
		Direction = "ToServer",
		Args = {
			{ "enum", CRASH_REASONS },
			{ "number", 0, 100000 },
			{ "vector3", 50 },
			{ "vector3", 2000 },
			{ "number", 0, 1e10 },
		},
		Rate = 2,
	},
	Vehicle_GetUp = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 1 },
	Vehicle_Push = { Kind = "Event", Direction = "ToServer", Args = { { "boolean" } }, Rate = 2 },
	Vehicle_Unload = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "instance", "Model", "Workspace" } },
		Rate = 1,
	},
	Rescue_Call = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 1, Per = 5 },
	Lift_Board = { Kind = "Function", Direction = "ToServer", Args = {}, Rate = 1, Per = 2 },
	Lift_Exit = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 1, Per = 2 },

	-- Shop, garage, properties ---------------------------------------------------
	Shop_Buy = { Kind = "Function", Direction = "ToServer", Args = { ID, { "number", 1, 24, true } }, Rate = 3, Per = 5 },
	Shop_Rent = { Kind = "Function", Direction = "ToServer", Args = { ID }, Rate = 1, Per = 2 },
	Shop_TestRide = { Kind = "Function", Direction = "ToServer", Args = { ID }, Rate = 1, Per = 2 },
	Property_Buy = { Kind = "Function", Direction = "ToServer", Args = { ID }, Rate = 1, Per = 2 },
	Garage_Visit = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "number", -1e12, 1e12, true } },
		Rate = 1,
		Per = 2,
	},
	Map_FastTravel = { Kind = "Event", Direction = "ToServer", Args = { ID }, Rate = 1, Per = 2 },

	-- Customization and tuning -- spec [381]
	Custom_BuyPart = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, ID, REQUEST_ID }, Rate = 4 },
	Custom_Install = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, ID, REQUEST_ID }, Rate = 4 },
	Custom_ApplyVisual = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { SERIAL, { "string", 2048 }, REQUEST_ID },
		Rate = 4,
	},
	Custom_BuyGear = { Kind = "Event", Direction = "ToServer", Args = { ID, REQUEST_ID }, Rate = 4 },
	Tune_Apply = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, { "string", 2048 }, REQUEST_ID }, Rate = 4 },
	Tune_Save = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { SERIAL, { "number", 1, 5, true }, { "string", 96 }, REQUEST_ID },
		Rate = 4,
	},
	Tune_Publish = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, REQUEST_ID }, Rate = 4 },
	Tune_Import = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, { "string", 9 }, REQUEST_ID }, Rate = 4 },
	Dyno_Run = { Kind = "Event", Direction = "ToServer", Args = { SERIAL, REQUEST_ID }, Rate = 4 },

	-- Jobs ----------------------------------------------------------------------------
	Job_Action = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "enum", { "Accept", "Interact", "Cancel" } }, ID },
		Rate = 5,
	},
	Job_Update = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },

	-- Races, events, stunts -------------------------------------------------------------
	Race_Join = { Kind = "Event", Direction = "ToServer", Args = { { "string", 32 } }, Rate = 1, Per = 2 },
	Race_Leave = { Kind = "Event", Direction = "ToServer", Args = {}, Rate = 1, Per = 2 },
	Race_Dab = { Kind = "Event", Direction = "ToServer", Args = { { "enum", { "L", "R" } } }, Rate = 4 },
	Race_GhostGet = { Kind = "Event", Direction = "ToServer", Args = { { "string", 32 } }, Rate = 1, Per = 2 },
	Race_State = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Race_Standings = { Kind = "Unreliable", Direction = "ToClient", Args = {}, Rate = 0 },
	Race_Results = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Race_GhostChunk = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Event_Vote = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "number", 1, 64, true }, { "number", 1, 5, true } },
		Rate = 2,
	},
	Collectible_Claim = { Kind = "Event", Direction = "ToServer", Args = { ID }, Rate = 2 },

	-- World -----------------------------------------------------------------------------------
	Weather_Lightning = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0 },
	Heat_Toggle = { Kind = "Event", Direction = "ToServer", Args = { { "enum", { "On", "Off" } } }, Rate = 1, Per = 2 },
	Heat_State = { Kind = "Unreliable", Direction = "ToClient", Args = {}, Rate = 0 },

	-- Social, server, admin -------------------------------------------------------------------
	Social_JoinFriend = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "number", 1, 1e12, true } },
		Rate = 1,
		Per = 5,
	},
	Social_SetBlocked = { Kind = "Event", Direction = "ToServer", Args = { { "string", 8192 } }, Rate = 1, Per = 5 },
	Server_Config = {
		Kind = "Event",
		Direction = "ToServer",
		Args = { { "enum", { "Time", "Weather", "TrafficDensity", "PoliceHeat", "Kick" } }, { "string", 64 } },
		Rate = 2,
	},
	Admin_Command = { Kind = "Event", Direction = "ToServer", Args = { { "string", 64 }, { "string", 512 } }, Rate = 2 },

	-- Studio-only developer tools -- spec [45]
	Dev_Command = { Kind = "Event", Direction = "ToServer", Args = { { "string", 256 } }, Rate = 4, StudioOnly = true },
	Dev_Reply = { Kind = "Event", Direction = "ToClient", Args = {}, Rate = 0, StudioOnly = true },
}

return table.freeze(defs)
