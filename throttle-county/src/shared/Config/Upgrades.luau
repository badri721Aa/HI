--!strict
-- Config/Upgrades: parts, sliders, tier multipliers and caps. -- spec [366]-[368]
-- Parts and sliders are authored in Phase 9; Phase 1 ships the typed skeleton.

export type PartEffect = { Field: string, Op: string, Value: number | string }

export type PartDef = {
	PartId: string,
	Brand: string,
	DisplayName: string,
	Category: string,
	Tier: string,
	Kinds: { string },
	VehicleIds: { string }?,
	Requires: { [string]: string }?,
	MassDelta_kg: number,
	MassHeight_mm: number?,
	Effects: { PartEffect },
}

local Upgrades = {
	Tiers = { "Stock", "Street", "Sport", "Race", "Pro" },
	TierPriceMul = { Stock = 0, Street = 0.5, Sport = 1.0, Race = 1.8, Pro = 3.0 },
	TierEffect = { Stock = 0, Street = 0.30, Sport = 0.55, Race = 0.80, Pro = 1.00 },
	CategoryShare = {
		Controller = 0.055,
		Battery = 0.10,
		Motor = 0.08,
		Exhaust = 0.05,
		ECU = 0.03,
		BigBore = 0.07,
		Suspension = 0.07,
		Weight = 0.06,
		Brakes = 0.03,
	},
	Caps = { NAGasPower_x = 1.30, NAMultiCylPower_x = 1.15, ElectricPower_x = 2.6, WeightReduction_pct = 8 },
	LaborShare = 0.15,
	Parts = {} :: { [string]: PartDef },
}

return table.freeze(Upgrades)
