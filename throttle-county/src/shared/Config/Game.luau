--!strict
-- Game: the one place the working title and build version live. -- spec [2], [484]
-- Renaming the game touches only GAME_TITLE.

local Game = {
	GAME_TITLE = "Throttle County",
	VERSION = "v0.1.0", -- shown in the Settings footer and every Logger error report (later phases)
	MAX_PLAYERS = 30, -- spec [21]
	GRAVITY = 35, -- studs/s^2, must match Units.GRAVITY; spec [21]
	SPAWN_POSITION = Vector3.new(0, 15, 0), -- Old Town spawn plaza; spec [3]
}

return table.freeze(Game)
