--!strict
-- Config/Economy: every economy tunable. Services never hold magic numbers. -- spec [38], [341], [459]
-- Phase 1 uses StartingCash, the starter grant and the dealership/property ids; the rest is
-- consumed from Phase 8 on.

local Economy = {
	StartingCash = 2500,
	MaxCash = 1000000000,
	ResaleFactor = 0.60,
	FuelPrice_usd_per_L = 2.00,
	ChargePrice_usd_per_kWh = 0.40,
	ChargeStationPowers_kW = { 20, 60 },
	HomeCharge_kW = 3.3,
	RefuelTimeCompression_x = 10,

	-- One-time new-profile grant -- spec [344], [453]
	StarterVehicleId = "kurb_street_bmx",
	StarterPropertyId = "old_town_studio_garage",

	-- VehicleIds withdrawn from sale: owned copies are refunded 100% of TotalSpent on load -- spec [455]
	RetiredVehicleIds = {} :: { [string]: boolean },

	Dealerships = {
		ThrottleWorks = { DisplayName = "Throttle Works" },
		VoltTalonEV = { DisplayName = "Volt & Talon EV Center" },
		RyujinKensei = { DisplayName = "Ryujin-Kensei Motorsports" },
		EuroClassic = { DisplayName = "Euro & Classic Motors" },
		DirtDepot = { DisplayName = "Dirt Depot" },
		SummitOutdoor = { DisplayName = "Summit Outdoor" },
		LakesideMarine = { DisplayName = "Lakeside Marine" },
		HaulerTruckTrailer = { DisplayName = "Hauler Truck & Trailer" },
	} :: { [string]: { DisplayName: string } },

	-- spec [360]
	Properties = {
		old_town_studio_garage = { DisplayName = "Old Town Studio Garage", Price = 0, MinLevel = 1, Slots = 3 },
		maple_heights_house = { DisplayName = "Maple Heights House", Price = 120000, MinLevel = 10, Slots = 6 },
		port_warehouse = { DisplayName = "Port Warehouse", Price = 400000, MinLevel = 30, Slots = 20 },
		hillside_estate = { DisplayName = "Hillside Estate", Price = 750000, MinLevel = 45, Slots = 15 },
	} :: { [string]: { DisplayName: string, Price: number, MinLevel: number, Slots: number } },
	GaragePlusSlots = 5,

	-- XPToNext(L) = round(Base + Coef * L^Exponent) -- spec [341]
	Rep = { Base = 250, Coef = 120, Exponent = 1.45, MaxLevel = 100 },

	-- Ledger reasons (enum) -- spec [365]
	Reasons = {
		"Job",
		"Race",
		"Event",
		"Challenge",
		"Achievement",
		"Collectible",
		"Streak",
		"Resale",
		"Refund",
		"IAP",
		"Admin",
		"Onboarding",
		"Purchase",
		"Upgrade",
		"Repair",
		"Fuel",
		"Charge",
		"Rental",
		"Fine",
		"EntryFee",
		"Escrow",
		"StreetRulesFine",
	},

	-- Creator Hub IDs; 0 = not created yet (store tile hidden) -- spec [458], [459]
	Monetization = {
		Passes = {
			VIP = 0, -- game pass, 399 R$: chat tag, nameplate frame, 3 paints, rooftop lounge
			GaragePlus = 0, -- game pass, 249 R$: +5 vehicle slots
			ProPaint = 0, -- game pass, 299 R$: chrome, chameleon, satin
			Lights = 0, -- game pass, 199 R$: LED strips, underglow, light colors
			DoubleCash = 0, -- game pass, 499 R$: 2x Cash from jobs, races, events, challenges
		},
		Products = {
			-- developer products: [ProductId] = Cash granted; real IDs are pasted as keys later
		} :: { [number]: number },
		ProductPlan = {
			{ Cash = 10000, Robux = 49 },
			{ Cash = 30000, Robux = 129 },
			{ Cash = 75000, Robux = 299 },
			{ Cash = 200000, Robux = 699 },
			{ Cash = 500000, Robux = 1499 },
		},
	},
}

return table.freeze(Economy)
