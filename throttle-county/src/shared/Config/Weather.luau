--!strict
-- Config/Weather: weather states, durations and region looks. -- spec [325], [330], [331]
-- Consumed by WeatherService and WeatherFXController from Phase 7.

export type WeatherState = {
	Zones: { string },
	MinDuration_s: number,
	MaxDuration_s: number,
	WetRate_per_s: number,
}

local states: { [string]: WeatherState } = {
	Clear = { Zones = { "Lowland", "Mountain", "Desert" }, MinDuration_s = 600, MaxDuration_s = 1500, WetRate_per_s = -0.0015 },
	Cloudy = { Zones = { "Lowland", "Mountain", "Desert" }, MinDuration_s = 300, MaxDuration_s = 900, WetRate_per_s = -0.0010 },
	Overcast = { Zones = { "Lowland", "Mountain", "Desert" }, MinDuration_s = 300, MaxDuration_s = 600, WetRate_per_s = -0.0004 },
	Rain = { Zones = { "Lowland", "Mountain" }, MinDuration_s = 240, MaxDuration_s = 600, WetRate_per_s = 0.004 },
	Storm = { Zones = { "Lowland", "Mountain" }, MinDuration_s = 180, MaxDuration_s = 360, WetRate_per_s = 0.008 },
	Fog = { Zones = { "Lowland", "Mountain" }, MinDuration_s = 240, MaxDuration_s = 480, WetRate_per_s = 0.0005 },
	Snow = { Zones = { "Mountain" }, MinDuration_s = 300, MaxDuration_s = 900, WetRate_per_s = 0 },
	Sandstorm = { Zones = { "Desert" }, MinDuration_s = 120, MaxDuration_s = 300, WetRate_per_s = -0.02 },
}

local Weather = {
	States = states,
	Zones = { "Lowland", "Mountain", "Desert" },
	DayLength_s = 2880, -- spec [326]
}

return table.freeze(Weather)
