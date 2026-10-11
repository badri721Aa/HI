--!strict
-- Config/Jobs: job payout and XP constants plus /econsim assumptions. -- spec [346]
-- Consumed by JobService from Phase 8.

export type JobDef = {
	MinLevel: number,
	Base_usd: number?,
	Rate_usd_per_km: number?,
	PerDrop_usd: number?,
	ExtraBike: number?,
	VRef_kmh: number?,
	DRAfter: number?,
	XPBase: number,
	XPPerKm: number?,
	PartsShare: number?,
	Callout_usd: number?,
	CalloutPct: number?,
}

local jobs: { [string]: JobDef } = {
	FoodDelivery = { MinLevel = 1, Base_usd = 110, Rate_usd_per_km = 190, VRef_kmh = 30, DRAfter = 20, XPBase = 80, XPPerKm = 120 },
	ParcelCourier = {
		MinLevel = 3,
		Base_usd = 120,
		Rate_usd_per_km = 160,
		PerDrop_usd = 30,
		VRef_kmh = 40,
		DRAfter = 10,
		XPBase = 150,
		XPPerKm = 120,
	},
	MotoTaxi = { MinLevel = 12, Base_usd = 200, Rate_usd_per_km = 340, VRef_kmh = 45, DRAfter = 15, XPBase = 200, XPPerKm = 150 },
	PartsRunner = { MinLevel = 12, Base_usd = 250, Rate_usd_per_km = 300, VRef_kmh = 50, DRAfter = 10, XPBase = 250, XPPerKm = 150 },
	BikeTransport = {
		MinLevel = 18,
		Base_usd = 500,
		Rate_usd_per_km = 300,
		ExtraBike = 0.5,
		VRef_kmh = 50,
		DRAfter = 8,
		XPBase = 500,
		XPPerKm = 250,
	},
	Mechanic = { MinLevel = 10, PartsShare = 0.40, Callout_usd = 150, CalloutPct = 0.10, XPBase = 300 },
}

local Jobs = {
	Jobs = jobs,
	-- /econsim assumptions: average road speed, handling time per stop, deadhead share -- spec [346]
	Sim = {
		AvgSpeedBMX_kmh = 22,
		AvgSpeedEBike_kmh = 28,
		HandlingPerStop_s = 25,
		DeadheadShare_x = 0.35,
	},
}

return table.freeze(Jobs)
