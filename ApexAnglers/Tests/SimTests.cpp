// Unit tests for the engine-agnostic simulation core (Source/ApexAnglers/Public/Sim).
// Build & run without Unreal:  ./Tests/run_tests.sh
#include "Sim/ApexMath.h"
#include "Sim/SeededRng.h"
#include "Sim/WaveField.h"
#include "Sim/ReelModel.h"
#include "Sim/FishAgent.h"
#include "Sim/FishFight.h"
#include "Sim/RopeSolver.h"
#include "Sim/HullModel.h"

#include <cstdio>
#include <functional>
#include <string>
#include <vector>

using namespace apex::sim;

static int GFailures = 0;
static int GChecks = 0;
#define CHECK(cond, ...) do { ++GChecks; if (!(cond)) { ++GFailures; std::printf("  FAIL %s:%d  %s  ", __FILE__, __LINE__, #cond); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)
#define NEAR(a, b, tol) (std::abs((a) - (b)) <= (tol))

struct TestCase { const char* Name; std::function<void()> Fn; };
static std::vector<TestCase>& Registry() { static std::vector<TestCase> R; return R; }
struct Registrar { Registrar(const char* N, std::function<void()> F) { Registry().push_back({ N, std::move(F) }); } };
#define TEST(name) static void name(); static Registrar reg_##name(#name, name); static void name()

// ------------------------------------------------------------------ RNG
TEST(Rng_IsDeterministic)
{
	SeededRng A(42), B(42), C(43);
	bool bSame = true, bDiff = false;
	for (int I = 0; I < 1000; ++I) { const uint64_t X = A.NextU64(); bSame &= X == B.NextU64(); bDiff |= X != C.NextU64(); }
	CHECK(bSame, "same seed must give same stream");
	CHECK(bDiff, "different seeds must differ");
}

TEST(Rng_ExponentialMean)
{
	SeededRng R(7);
	double Sum = 0.0;
	const int N = 200000;
	for (int I = 0; I < N; ++I) Sum += R.Exponential(5.0);
	CHECK(NEAR(Sum / N, 5.0, 0.1), "mean=%f", Sum / N);
}

// ------------------------------------------------------------------ Waves
TEST(Waves_StayWithinAmplitudeSum)
{
	WaveField W;
	double MaxAbs = 0.0, AmpSum = 0.0;
	for (const Wave& V : W.GetWaves()) AmpSum += V.Amplitude;
	for (int I = 0; I < 5000; ++I) MaxAbs = std::max(MaxAbs, std::abs(W.HeightAt(I * 1.7, I * -0.9, I * 0.05)));
	CHECK(MaxAbs <= AmpSum + 1e-9, "max=%f sum=%f", MaxAbs, AmpSum);
	CHECK(MaxAbs > AmpSum * 0.5, "waves should actually move (max=%f)", MaxAbs);
}

// ------------------------------------------------------------------ Reel / rod
TEST(Reel_TensionFollowsHookesLawWithRodGive)
{
	ReelModel R;
	R.Reset(10.0, 10000.0); // drag above anything -> no slip
	// Let rod deflection settle for a fixed 10.05 m chord.
	for (int I = 0; I < 2000; ++I) R.Step(1.0 / 240.0, 10.05, 0.0);
	const double Give = R.Rod.TipDeflection(R.State.Tension);
	const double Expected = R.Params.LineStiffness * (10.05 - 10.0 - Give) / 10.0;
	CHECK(NEAR(R.State.Tension, Expected, 1.0), "T=%f expected=%f", R.State.Tension, Expected);
	CHECK(Give > 0.0, "rod should flex under load");
}

TEST(Reel_DragClutchCapsTension)
{
	ReelModel R;
	R.Reset(10.0, 400.0);
	double Chord = 10.0;
	double MaxT = 0.0;
	for (int I = 0; I < 240 * 5; ++I) { Chord += 3.0 / 240.0; R.Step(1.0 / 240.0, Chord, 0.0); MaxT = std::max(MaxT, R.State.Tension); }
	CHECK(!R.State.bSnapped, "fish running at 3 m/s with drag 400N must not snap 900N line");
	CHECK(R.State.LineOut > 20.0, "line should pay out (L=%f)", R.State.LineOut);
	CHECK(NEAR(R.State.Tension, 400.0 + 3.0 * R.Params.DragSlipDamping, 120.0), "steady T=%f", R.State.Tension);
	CHECK(R.State.Heat > 5.0, "slipping drag should heat the reel (H=%f)", R.State.Heat);
}

TEST(Reel_SnapsAfterGraceWindow)
{
	ReelModel R;
	R.Reset(10.0, 5000.0);
	R.State.Tension = 0.0;
	int Steps = 0;
	// 2 m of stretch: the rod blank maxes out (0.9 m) and the line takes the rest -> overload.
	while (!R.State.bSnapped && Steps < 2000) { R.Step(1.0 / 240.0, 12.0, 0.0); ++Steps; }
	CHECK(R.State.bSnapped, "large overload must snap");
	CHECK(R.SnapEnergy() > 0.0, "snap releases stored energy");
}

TEST(Reel_RodAbsorbsSmallShocks)
{
	// Half a meter of sudden stretch is soaked up by the rod bending: no snap (GDD §6 shock absorption).
	ReelModel R;
	R.Reset(10.0, 5000.0);
	for (int I = 0; I < 240; ++I) R.Step(1.0 / 240.0, 10.5, 0.0);
	CHECK(!R.State.bSnapped, "rod flex should absorb it (T=%f)", R.State.Tension);
	CHECK(R.State.Tension < R.Params.BreakStrength * 0.5, "T=%f", R.State.Tension);
}

TEST(Reel_HeatWeakensLine)
{
	ReelModel R;
	R.Reset(10.0, 600.0);
	const double Cold = R.EffectiveBreakStrength();
	R.State.Heat = R.Params.HeatMax;
	CHECK(NEAR(R.EffectiveBreakStrength(), Cold * 0.4, 1e-6), "max heat = 40%% strength");
	R.Douse(0.4);
	CHECK(R.State.Heat < R.Params.HeatMax, "dousing cools");
}

TEST(Rod_BendsAndSaturates)
{
	RodParams Rod;
	CHECK(Rod.TipDeflection(0.0) == 0.0, "no load no bend");
	CHECK(Rod.TipDeflection(100.0) > 0.0, "bends under load");
	CHECK(Rod.TipDeflection(1e6) == Rod.MaxDeflection, "saturates");
	CHECK(Rod.TipAngle(1e6) == Rod.MaxTipAngle, "angle clamps");
}

// ------------------------------------------------------------------ Fish fight
static EFightResult RunFight(FishFight& F, double DragN, double ReelPolicyMaxRatio, double MaxSeconds, uint64_t Seed, double* OutMaxTension = nullptr)
{
	WaveField Water;
	FightConfig Cfg;
	Cfg.DragSetting = DragN;
	const Vec3 Anchor(0, 0, 1.5);
	F.Begin(Cfg, Anchor, Vec3(25, 0, -2), Seed);
	const double Dt = 1.0 / 60.0;
	double MaxT = 0.0;
	for (double T = 0; T < MaxSeconds && F.GetResult() == EFightResult::Ongoing; T += Dt)
	{
		// A decent player: crank while tension is comfortable, ease off near the limit.
		const double Input = F.Reel.TensionRatio() < ReelPolicyMaxRatio ? 1.0 : 0.0;
		F.Step(Dt, Anchor, Input, Water, T);
		MaxT = std::max(MaxT, F.Reel.State.Tension);
	}
	if (OutMaxTension) *OutMaxTension = MaxT;
	return F.GetResult();
}

TEST(Fight_SkilledPlayerLandsFish)
{
	FishFight F;
	const EFightResult R = RunFight(F, 600.0, 0.6, 180.0, 1234);
	std::printf("    landed in %.1fs, fish stamina %.2f, line out %.1fm\n", F.GetElapsed(), F.Fish.State.Stamina, F.Reel.State.LineOut);
	CHECK(R == EFightResult::Landed, "result=%s after %.1fs", ToString(R), F.GetElapsed());
	CHECK(F.GetElapsed() > 5.0, "fight should take real effort (%.1fs)", F.GetElapsed());
	CHECK(F.Fish.State.Stamina < 0.9, "fish should be tired (%.2f)", F.Fish.State.Stamina);
}

TEST(Fight_LockedDragPlusCrankingSnaps)
{
	// Drag screwed down past break strength and cranking non-stop: a strong fish breaks the line.
	FishFight F;
	F.Begin(FightConfig{}, Vec3(0, 0, 1.5), Vec3(25, 0, -2), 99);
	FightConfig Strong;
	Strong.Species.MaxForce = 2600.0;
	Strong.Species.Mass = 60.0;
	Strong.DragSetting = 5000.0;
	WaveField Water;
	F.Begin(Strong, Vec3(0, 0, 1.5), Vec3(25, 0, -2), 99);
	for (double T = 0; T < 60.0 && F.GetResult() == EFightResult::Ongoing; T += 1.0 / 60.0) F.Step(1.0 / 60.0, Vec3(0, 0, 1.5), 1.0, Water, T);
	CHECK(F.GetResult() == EFightResult::Snapped, "result=%s", ToString(F.GetResult()));
}

TEST(Fight_IsDeterministicPerSeed)
{
	FishFight A, B, C;
	RunFight(A, 600.0, 0.6, 180.0, 555);
	RunFight(B, 600.0, 0.6, 180.0, 555);
	RunFight(C, 600.0, 0.6, 180.0, 556);
	CHECK(A.GetElapsed() == B.GetElapsed() && A.GetResult() == B.GetResult(), "same seed must replay identically");
	CHECK(A.Fish.State.Position.X == B.Fish.State.Position.X, "bit-identical positions");
	CHECK(A.GetElapsed() != C.GetElapsed() || A.Fish.State.Position.X != C.Fish.State.Position.X, "different seed should differ");
}

TEST(Fight_AnchorForcePointsAtFish)
{
	FishFight F;
	WaveField Water;
	const Vec3 Anchor(0, 0, 1.5);
	F.Begin(FightConfig{}, Anchor, Vec3(25, 0, -2), 3);
	for (int I = 0; I < 240; ++I) F.Step(1.0 / 60.0, Anchor, 1.0, Water, I / 60.0);
	const Vec3 Fa = F.AnchorForce(Anchor);
	CHECK(Fa.Length() > 0.0, "line should be loaded");
	CHECK(Fa.Normalized().Dot((F.Fish.State.Position - Anchor).Normalized()) > 0.999, "force along line toward fish");
}

// ------------------------------------------------------------------ Rope
TEST(Rope_SagsWhenSlackAndHoldsLength)
{
	RopeSolver R;
	R.Reset(Vec3(0, 0, 10), Vec3(10, 0, 10), 14.0);
	for (int I = 0; I < 600; ++I) R.Step(1.0 / 60.0, nullptr, 0.0);
	const auto& P = R.GetPoints();
	CHECK(P[P.size() / 2].Z < 7.0, "slack rope should sag (mid z=%f)", P[P.size() / 2].Z);
	CHECK(NEAR(R.CurrentLength(), 14.0, 0.3), "length=%f", R.CurrentLength());
	CHECK(P.front().Z == 10.0 && P.back().X == 10.0, "ends stay pinned");
}

TEST(Rope_TautIsNearlyStraight)
{
	RopeSolver R;
	R.Reset(Vec3(0, 0, 5), Vec3(20, 0, 5), 20.0);
	for (int I = 0; I < 600; ++I) R.Step(1.0 / 60.0, nullptr, 0.0);
	const auto& P = R.GetPoints();
	CHECK(P[P.size() / 2].Z > 3.5, "taut rope barely sags (mid z=%f)", P[P.size() / 2].Z);
}

// ------------------------------------------------------------------ Hull
TEST(Hull_FloatsAtArchimedesDraft)
{
	// 4 pontoons of a 8m x 3m x 1.2m box hull, 5 t -> draft = m / (rho * A) = 0.203 m
	HullParams H;
	const double Area = 8.0 * 3.0, HeightM = 1.2;
	std::vector<Pontoon> P;
	for (double X : { -2.0, 2.0 }) for (double Y : { -0.75, 0.75 }) P.push_back({ Vec3(X, Y, 0), Area * HeightM / 4.0, HeightM });
	double Z = 0.5, Vz = 0.0; // hull bottom height above water
	const double Dt = 1.0 / 240.0;
	for (int I = 0; I < 240 * 30; ++I)
	{
		double F = -H.Mass * kGravity;
		for (const Pontoon& Pt : P) F += BuoyantForce(Pt, SubmergedFraction(Z + Pt.LocalOffset.Z, Pt.Height, 0.0));
		F += HullDragLocal(Vec3(0, 0, Vz), H).Z;
		Vz += F / H.Mass * Dt;
		Z += Vz * Dt;
	}
	const double Draft = -Z;
	CHECK(NEAR(Draft, H.Mass / (kWaterDensity * Area), 0.01), "draft=%f expected=%f", Draft, H.Mass / (kWaterDensity * Area));
}

TEST(Hull_LeviathanTowSpeedMatchesGdd)
{
	// GDD §10: T = 60 kN, CdA = 0.6 -> ~14 m/s
	const double V = SteadyTowSpeed(60000.0, 0.6);
	CHECK(NEAR(V, 13.97, 0.05), "v=%f", V);
	// And an integrated 5 t hull reaches it.
	HullParams H;
	double U = 0.0;
	for (int I = 0; I < 240 * 60; ++I) U += (60000.0 + HullDragLocal(Vec3(U, 0, 0), H).X) / H.Mass / 240.0;
	CHECK(NEAR(U, V, 0.05), "integrated=%f analytic=%f", U, V);
}

TEST(Hull_LoadedBoatsSlideMore)
{
	HullParams H;
	const double Light = std::abs(HullDragLocal(Vec3(0, 2, 0), H, 1.0).Y);
	const double Heavy = std::abs(HullDragLocal(Vec3(0, 2, 0), H, 2.0).Y);
	CHECK(Heavy < Light, "heavy=%f light=%f", Heavy, Light);
}

int main()
{
	for (const TestCase& T : Registry())
	{
		const int Before = GFailures;
		std::printf("[ RUN  ] %s\n", T.Name);
		T.Fn();
		std::printf("[ %s ] %s\n", GFailures == Before ? " OK " : "FAIL", T.Name);
	}
	std::printf("\n%d tests, %d checks, %d failures\n", static_cast<int>(Registry().size()), GChecks, GFailures);
	return GFailures ? 1 : 0;
}
