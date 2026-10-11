--!strict
-- Types: export type declarations only. -- spec [29]
-- Fields marked optional are filled in by later phases; Phase 1 needs only the shapes.

local Signal = require(script.Parent.Signal)

export type Signal = Signal.Signal

---------------------------------------------------------------------------
-- Vehicle config (twelve groups) -- spec [37], [76], [127]
---------------------------------------------------------------------------

export type PowertrainKind = "Pedal" | "Electric" | "Gas2T" | "Gas4T" | "Diesel"

export type IdentityConfig = {
	VehicleId: string,
	DisplayName: string,
	Brand: string,
	Class: string,
}

export type EconomyConfig = {
	Price: number,
	UnlockLevel: number,
	Dealership: string,
}

export type DimensionsConfig = {
	Wheelbase_mm: number?,
	Length_mm: number?,
	Width_mm: number?,
	Height_mm: number?,
	SeatHeight_mm: number?,
	WheelDiaF_mm: number?,
	WheelDiaR_mm: number?,
	BarWidth_mm: number?,
	TrackF_mm: number?,
	TrackR_mm: number?,
	DeckHeight_mm: number?,
	RampLength_mm: number?,
}

export type MassConfig = {
	Mass_kg: number,
	CoMHeight_mm: number?,
	GVWR_kg: number?,
}

export type ChassisConfig = {
	Rake_deg: number?,
	Trail_mm: number?,
	SteerLock_deg: number?,
	MaxLean_deg: number?,
	ScrapeLean_deg: number?,
	BrakeTorqueF_Nm: number?,
	BrakeTorqueR_Nm: number?,
	BrakeBiasF_x: number?,
	SteeringDamper: number?,
	AirPitchTorque_Nm: number?,
	CdA_m2: number?,
	AckermannFactor: number?,
	AntiRollF_Nmm: number?,
	AntiRollR_Nmm: number?,
}

export type SuspensionConfig = {
	TravelF_mm: number?,
	TravelR_mm: number?,
	SpringRateF_Nmm: number?,
	SpringRateR_Nmm: number?,
	PreloadF_mm: number?,
	PreloadR_mm: number?,
	ProgressionF: number?,
	ProgressionR: number?,
	SagTargetF_pct: number?,
	SagTargetR_pct: number?,
	LeverageRatio: number?,
	Adjusters: string?,
}

export type TiresConfig = {
	FrontCompound: string,
	RearCompound: string,
	WidthF_mm: number?,
	WidthR_mm: number?,
	PressureF_kPa: number?,
	PressureR_kPa: number?,
	GripMul: number?,
}

export type RideModeConfig = {
	Name: string,
	PowerScale_x: number,
	CurrentScale_x: number?,
	SpeedCap_kmh: number,
	ThrottleMap: string,
	ThrottleRamp_ms: number?,
	RegenScale_x: number?,
}

export type ElectricSpec = {
	Pack_V: number,
	Capacity_Ah: number,
	Capacity_Wh: number,
	PackFull_V: number?,
	PackEmpty_V: number?,
	MotorRef_V: number?,
	Pack_ohm: number?,
	MaxDischarge_A: number?,
	PhaseCurrent_A: number?,
	BatteryCurrent_A: number?,
	RegenCurrent_A: number?,
	Reduction_x: number?,
	FieldWeakening_x: number?,
	MaxSpeed_rpm: number?,
	MaxCharge_kW: number?,
	RatedRange_km: number?,
	RideModes: { RideModeConfig }?,
}

export type TorqueRow = { number }

export type EngineSpec = {
	Inertia_kgm2: number,
	Idle_rpm: number,
	Redline_rpm: number,
	Limiter: string,
	StartType: string,
	TorqueCurve: { TorqueRow },
	PeakTorque_rpm: number?,
	PeakPower_rpm: number?,
}

export type ClutchSpec = { Type: string, Capacity_Nm: number? }

export type GearboxSpec = {
	Ratios_x: { number },
	Primary_x: number,
	FinalDrive_x: number,
	ShiftTime_s: number?,
	Quickshifter: boolean?,
}

export type CvtSpec = {
	Engage_rpm: number,
	RatioLow_x: number,
	RatioHigh_x: number,
	FinalDrive_x: number?,
}

export type FuelSpec = {
	FuelType: string,
	Tank_L: number,
	PremixRatio: number?,
	OilTank_L: number?,
}

export type PedalSpec = {
	ChainringTeeth: { number }?,
	CassetteTeeth: { number }?,
	Crank_mm: number?,
	Fixed: boolean?,
}

export type DrivelineSpec = {
	Type: string,
	Efficiency_x: number,
}

export type PowertrainConfig = {
	Kind: PowertrainKind,
	PeakPower_kW: number,
	PeakTorque_Nm: number?,
	TopSpeed_kmh: number,
	DescentCap_kmh: number?,
	Target0to50_s: number?,
	Target0to25_s: number?,
	WadeDepth_mm: number?,
	Electric: ElectricSpec?,
	Engine: EngineSpec?,
	Clutch: ClutchSpec?,
	Gearbox: GearboxSpec?,
	Cvt: CvtSpec?,
	Fuel: FuelSpec?,
	Pedal: PedalSpec?,
	Driveline: DrivelineSpec?,
}

export type AssistsConfig = {
	TractionControl: boolean?,
	ABS: boolean?,
	WheelieControl: boolean?,
	LaunchControl: boolean?,
	CorneringABS: boolean?,
}

export type AudioConfig = {
	Profile: string,
	EqPreset: string?,
	BaseVolume: number?,
	RollOffClass: string?,
	PolePairs: number?,
}

export type VisualConfig = {
	Model: string,
	FactoryColors: { string }?,
	HeadlightOnFork: boolean?,
}

export type SeatsConfig = {
	Riders: number,
	Passengers: number,
	RiderStance: string?,
	Cargo_L: number?,
	Payload_kg: number?,
	BikeSlots: number?,
}

export type VehicleConfig = {
	Identity: IdentityConfig,
	Economy: EconomyConfig,
	Dimensions: DimensionsConfig,
	Mass: MassConfig,
	Chassis: ChassisConfig,
	Suspension: SuspensionConfig,
	Tires: TiresConfig,
	Powertrain: PowertrainConfig,
	Assists: AssistsConfig,
	Audio: AudioConfig,
	Visual: VisualConfig,
	Seats: SeatsConfig,
}

---------------------------------------------------------------------------
-- Replicated vehicle state (decoded Vehicle_State packet) -- spec [36]
---------------------------------------------------------------------------

export type VehicleState = {
	Seq: number,
	Rpm: number,
	Throttle: number,
	Brake: number,
	Steer: number,
	Lean_deg: number,
	Gear: number,
	Flags: number,
	Mode: number,
}

---------------------------------------------------------------------------
-- Player data -- spec [453], [454], [447]
---------------------------------------------------------------------------

export type AudioSettings = {
	Master: number,
	Engines: number,
	VehiclesSFX: number,
	Ambience: number,
	Music: number,
	UI: number,
	Radio: boolean,
	OtherRadios: boolean,
}

export type CameraSettings = {
	BaseFOV: number,
	Roll: number,
	Shake: number,
	AutoRecenter: boolean,
}

export type HUDSettings = {
	Scale: number,
	Hidden: { [string]: boolean },
}

export type HoldToggleSettings = {
	Clutch: string,
	LookBack: string,
}

export type PlayerSettings = {
	Version: number,
	Units: string,
	Graphics: string,
	Palette: string,
	Audio: AudioSettings,
	Camera: CameraSettings,
	HUD: HUDSettings,
	ReduceMotion: string,
	Vibration: string,
	HoldToggle: HoldToggleSettings,
	Realism: string,
	StreetRules: boolean,
	AutoLights: boolean,
	AllowFriendJoin: boolean,
	TrafficDensity: number,
	TireMarks: boolean,
	PostFX: boolean,
	Nameplates: string,
	StreamerMode: boolean,
	Assists: { [string]: string },
	Controls: { [string]: string },
}

export type PaintZone = { Hex: string, Finish: string }
export type Tune = { Name: string, Values: { [string]: number } }

export type WearState = {
	TreadF: number,
	TreadR: number,
	ChainLube: number,
	ChainStretch: number,
	PadsF: number,
	PadsR: number,
	OilHours: number,
	AirFilter: number,
	PackSoH: number,
}

export type OwnedVehicle = {
	Serial: string,
	VehicleId: string,
	Upgrades: { [string]: string },
	OwnedParts: { [string]: boolean },
	Visual: { [string]: string },
	Tunes: { Tune },
	ActiveTune: number,
	Paint: { [string]: PaintZone },
	Plate: string,
	NumberBoard: string,
	Odometer_km: number,
	DamageState: { [string]: number },
	Wear: WearState,
	Fuel_L: number,
	Charge_Wh: number,
	TotalSpent: number,
	AcquiredAt: number,
}

export type LedgerEntry = {
	Id: number,
	T: number,
	Kind: string,
	Delta: number,
	Balance: number,
	Ref: string,
}

export type Rating = { R: number, Races: number, Wins: number, Peak: number }

export type ChallengeState = {
	DayIndex: number,
	Daily: { string },
	DailyDone: { [string]: boolean },
	WeekIndex: number,
	Weekly: { string },
	WeeklyDone: { [string]: boolean },
	RerollUsed: boolean,
	StreakDay: number,
	LastClaimDay: number,
}

export type ProgressState = {
	Mastery: { [string]: number },
	Collectibles: { [string]: boolean },
	FastTravel: { [string]: boolean },
	Onboarding: { [string]: boolean },
	JobDR: { [string]: number },
}

export type GearState = {
	Owned: { [string]: boolean },
	Loadouts: { [string]: { [string]: string } },
}

export type PlayerProfile = {
	DataVersion: number,
	Cash: number,
	RepXP: number,
	Level: number,
	OwnedVehicles: { [string]: OwnedVehicle },
	Garage: { [string]: { string } },
	Properties: { [string]: number },
	Settings: PlayerSettings,
	Stats: { [string]: number },
	Achievements: { [string]: number },
	Challenges: ChallengeState,
	Progress: ProgressState,
	Ratings: { [string]: Rating },
	PersonalBests: { [string]: number },
	RiderGear: GearState,
	CrewId: string,
	Receipts: { string },
	Ledger: { LedgerEntry },
	LedgerHead: number,
	Strikes: { number },
	Flags: { [string]: boolean },
}

---------------------------------------------------------------------------
-- Networking -- spec [34], [35]
---------------------------------------------------------------------------

export type NetKind = "Event" | "Unreliable" | "Function"
export type NetDirection = "ToServer" | "ToClient" | "Both"

-- One positional spec tuple, e.g. {"number", 0, 10, true} or {"enum", {"A", "B"}}
export type ArgSpec = { string | number | boolean | { string } }

export type NetDef = {
	Kind: NetKind,
	Direction: NetDirection,
	Args: { ArgSpec },
	Rate: number, -- requests allowed per Per seconds (ToServer only)
	Per: number?, -- window in seconds, default 1
	StudioOnly: boolean?,
}

---------------------------------------------------------------------------
-- Boot registry and module interfaces -- spec [26], [27]
---------------------------------------------------------------------------

export type Registry = { [string]: any }

export type BootModule = {
	Name: string,
	Init: (self: any, registry: Registry) -> (),
	Start: (self: any) -> (),
}

export type ProfileLoadedHandler = (player: Player, profile: PlayerProfile, isNew: boolean) -> ()

export type IDataService = {
	Name: string,
	IsShuttingDown: boolean,
	ProfileLoaded: Signal,
	ProfileReleased: Signal,
	GetProfile: (self: any, player: Player) -> PlayerProfile?,
	WaitForProfile: (self: any, player: Player, timeout_s: number) -> PlayerProfile?,
	RequestSave: (self: any, player: Player) -> (),
	GetSanitizedSnapshot: (self: any, player: Player) -> { [string]: unknown }?,
	ResetProfile: (self: any, player: Player) -> boolean,
	IsSessionOnly: (self: any) -> boolean,
}

export type IPlayerService = {
	Name: string,
	PlayerReady: Signal,
	IsReady: (self: any, player: Player) -> boolean,
}

export type IAntiCheatService = {
	Name: string,
	GetScore: (self: any, player: Player) -> number,
}

return table.freeze({})
