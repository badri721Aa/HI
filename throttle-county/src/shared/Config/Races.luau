--!strict
-- Config/Races: race definitions keyed by RaceId, server events and trick table. -- spec [392], [412], [413]
-- Races are authored in Phase 10; Phase 1 ships the empty typed table so RaceService can boot.

export type RaceDef = {
	RaceId: string,
	TrackId: string,
	Type: string,
	Name: string,
	Venue: string,
	Laps: number,
	Start: string,
	Interval_s: number?,
	PIClasses: { string },
	VehicleClasses: { string },
	SimOnly: boolean,
	Spec: string?,
	MinPlayers: number,
	MaxPlayers: number,
	EntryFee: number,
	DNF_s: number,
	Length_m: number,
	KillY_studs: number,
	Phases: { string }?,
	Discipline: string,
	Floor_ms: number,
	Reward: { Base: number, XP: number },
}

local Races = {
	Types = {
		"Motocross",
		"Supercross",
		"Enduro",
		"HillClimb",
		"Trials",
		"Rally",
		"Street",
		"Canyon",
		"Drag",
		"TopSpeed",
		"TimeTrial",
	},
	Races = {} :: { [string]: RaceDef },
	MaxInstancesPerServer = 3,
}

return table.freeze(Races)
