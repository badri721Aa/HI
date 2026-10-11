--!strict
-- Units: the only module allowed to hold unit conversion factors. -- spec [28]
-- Configs stay SI; conversion happens once when a vehicle binds. 1 stud = 0.28 m.

local STUD_M = 0.28
local M_TO_STUDS = 1 / STUD_M
local KG_TO_RMU = 1 / 21.952

local Units = {
	STUD_M = STUD_M,
	M_TO_STUDS = M_TO_STUDS, -- 3.5714
	GRAVITY = 35, -- studs/s^2 (9.80 m/s^2)
	RMU_KG = 21.952,
	KG_TO_RMU = KG_TO_RMU,
	KMH_TO_SPS = 1 / (3.6 * STUD_M), -- 0.99206
	MPH_TO_SPS = 0.44704 / STUD_M, -- 1.59657
	HP_TO_KW = 0.7457,
	N_TO_FORCE = M_TO_STUDS * KG_TO_RMU, -- 0.16269 RMU*stud/s^2 per newton
	NM_TO_TORQUE = M_TO_STUDS * M_TO_STUDS * KG_TO_RMU, -- 0.58104
}

-- returns studs
local function mToStuds(m: number): number
	return m * M_TO_STUDS
end

-- returns meters
local function studsToM(studs: number): number
	return studs * STUD_M
end

-- returns studs
local function mmToStuds(mm: number): number
	return mm * 0.001 * M_TO_STUDS
end

-- returns studs/s
local function kmhToStudsPerSec(kmh: number): number
	return kmh * Units.KMH_TO_SPS
end

-- returns km/h
local function studsPerSecToKmh(sps: number): number
	return sps / Units.KMH_TO_SPS
end

-- returns mph
local function studsPerSecToMph(sps: number): number
	return sps / Units.MPH_TO_SPS
end

-- returns RMU (Roblox mass units)
local function kgToRMU(kg: number): number
	return kg * KG_TO_RMU
end

-- returns kg
local function rmuToKg(rmu: number): number
	return rmu * 21.952
end

-- returns kW
local function hpToKW(hp: number): number
	return hp * Units.HP_TO_KW
end

-- returns RMU*stud/s^2
local function newtonsToRobloxForce(n: number): number
	return n * Units.N_TO_FORCE
end

-- returns RMU*stud^2/s^2
local function nmToRobloxTorque(nm: number): number
	return nm * Units.NM_TO_TORQUE
end

-- returns RMU*stud/s (impulse)
local function newtonSecondsToImpulse(ns: number): number
	return ns * Units.N_TO_FORCE
end

-- N/mm spring rate -> RMU/s^2 (force per stud of compression); spec [53]
local function nmmToRobloxSpring(nmm: number): number
	return nmm * 1000 * KG_TO_RMU
end

-- N*s/m damper rate -> RMU/s; spec [53]
local function nsmToRobloxDamper(nsm: number): number
	return nsm * KG_TO_RMU
end

local Exported = {
	STUD_M = Units.STUD_M,
	M_TO_STUDS = Units.M_TO_STUDS,
	GRAVITY = Units.GRAVITY,
	RMU_KG = Units.RMU_KG,
	KG_TO_RMU = Units.KG_TO_RMU,
	KMH_TO_SPS = Units.KMH_TO_SPS,
	MPH_TO_SPS = Units.MPH_TO_SPS,
	HP_TO_KW = Units.HP_TO_KW,
	N_TO_FORCE = Units.N_TO_FORCE,
	NM_TO_TORQUE = Units.NM_TO_TORQUE,
	mToStuds = mToStuds,
	studsToM = studsToM,
	mmToStuds = mmToStuds,
	kmhToStudsPerSec = kmhToStudsPerSec,
	studsPerSecToKmh = studsPerSecToKmh,
	studsPerSecToMph = studsPerSecToMph,
	kgToRMU = kgToRMU,
	rmuToKg = rmuToKg,
	hpToKW = hpToKW,
	newtonsToRobloxForce = newtonsToRobloxForce,
	nmToRobloxTorque = nmToRobloxTorque,
	newtonSecondsToImpulse = newtonSecondsToImpulse,
	nmmToRobloxSpring = nmmToRobloxSpring,
	nsmToRobloxDamper = nsmToRobloxDamper,
}

return table.freeze(Exported)
