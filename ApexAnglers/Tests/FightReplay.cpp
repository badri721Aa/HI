// Runs one fish fight through the real sim core (the same headers the Unreal game uses) and writes
// per-frame telemetry as JSON, so the fight can be visualized without the engine.
//   c++ -std=c++20 -O2 -I Source/ApexAnglers/Public Tests/FightReplay.cpp -o /tmp/replay && /tmp/replay 1234 > fight.json
#include "Sim/FishFight.h"
#include "Sim/RopeSolver.h"
#include "Sim/WaveField.h"

#include <cstdio>
#include <cstdlib>

using namespace apex::sim;

int main(int argc, char** argv)
{
	const uint64_t Seed = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 1234;
	WaveField Water;
	FightConfig Cfg;
	Cfg.DragSetting = 600.0;
	const Vec3 Anchor(0, 0, 2.6); // rod tip above the deck

	FishFight Fight;
	Fight.Begin(Cfg, Anchor, Vec3(24, 0, -1.0), Seed);
	RopeSolver Rope;
	Rope.Reset(Anchor, Fight.Fish.State.Position, Fight.Reel.State.LineOut);

	const double Dt = 1.0 / 30.0;
	std::printf("{\"seed\":%llu,\"frames\":[", static_cast<unsigned long long>(Seed));
	bool bFirst = true;
	for (double T = 0.0; T < 120.0; T += Dt)
	{
		// Same "decent player" as the unit test: reel while tension is comfortable.
		const double Reel = Fight.Reel.TensionRatio() < 0.6 ? 1.0 : 0.0;
		const EFightResult R = Fight.Step(Dt, Anchor, Reel, Water, T);
		Rope.SetRestLength(Fight.Reel.State.LineOut);
		Rope.SetEndpoints(Anchor, Fight.Fish.State.Position);
		Rope.Step(Dt, &Water, T);

		const FishState& F = Fight.Fish.State;
		std::printf("%s{\"t\":%.3f,\"fx\":%.3f,\"fz\":%.3f,\"tension\":%.1f,\"ratio\":%.3f,\"line\":%.2f,\"stamina\":%.3f,\"heat\":%.1f,\"reel\":%.0f,\"beh\":\"%s\",\"air\":%d,\"res\":\"%s\",\"boatz\":%.3f,\"rope\":[",
			bFirst ? "" : ",", T, F.Position.X, F.Position.Z, Fight.Reel.State.Tension, Fight.Reel.TensionRatio(),
			Fight.Reel.State.LineOut, F.Stamina, Fight.Reel.State.Heat, Reel, ToString(F.Behavior), F.bAirborne ? 1 : 0,
			ToString(R), Water.HeightAt(0, 0, T));
		bFirst = false;
		const auto& P = Rope.GetPoints();
		for (size_t I = 0; I < P.size(); ++I) std::printf("%s[%.2f,%.2f]", I ? "," : "", P[I].X, P[I].Z);
		std::printf("],\"wave\":[");
		for (int X = -10; X <= 40; ++X) std::printf("%s%.3f", X > -10 ? "," : "", Water.HeightAt(X, 0, T));
		std::printf("]}");
		if (R != EFightResult::Ongoing) break;
	}
	std::printf("],\"result\":\"%s\",\"seconds\":%.2f}\n", ToString(Fight.GetResult()), Fight.GetElapsed());
	return 0;
}
