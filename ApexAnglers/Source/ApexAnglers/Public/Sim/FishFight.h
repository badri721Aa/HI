// One hooked-fish fight: couples the reel/line model with the fish agent at a fixed substep rate.
// The server runs this; clients only render the replicated result (GDD §8).
#pragma once

#include "ReelModel.h"
#include "FishAgent.h"

namespace apex::sim
{
	enum class EFightResult : uint8_t { Ongoing, Landed, Snapped, Spooled };

	inline const char* ToString(EFightResult R)
	{
		switch (R)
		{
		case EFightResult::Ongoing: return "Ongoing";
		case EFightResult::Landed: return "Landed";
		case EFightResult::Snapped: return "Snapped";
		case EFightResult::Spooled: return "Spooled";
		}
		return "?";
	}

	struct FightConfig
	{
		ReelParams Reel;
		RodParams Rod;
		FishSpecies Species;
		double DragSetting = 600.0;
		double LandDistance = 2.5;      // m from rod tip
		double SubstepHz = 240.0;       // stiff line needs small steps
	};

	class FishFight
	{
	public:
		void Begin(const FightConfig& InConfig, const Vec3& Anchor, const Vec3& HookPosition, uint64_t Seed)
		{
			Config = InConfig;
			Reel.Params = Config.Reel;
			Reel.Rod = Config.Rod;
			Reel.Reset((HookPosition - Anchor).Length() + 0.5, Config.DragSetting);
			Fish.Reset(Config.Species, HookPosition, Seed);
			Result = EFightResult::Ongoing;
			Elapsed = 0.0;
			Accumulator = 0.0;
		}

		void SetDrag(double Newtons) { Reel.State.DragSetting = Clamp(Newtons, 0.0, Config.Reel.BreakStrength * 1.2); }

		/** Advance by a (variable) frame delta; internally uses fixed substeps for determinism. */
		EFightResult Step(double FrameDt, const Vec3& Anchor, double ReelInput, const WaveField& Water, double Time)
		{
			if (Result != EFightResult::Ongoing) return Result;
			const double H = 1.0 / Config.SubstepHz;
			Accumulator += (std::min)(FrameDt, 0.1);
			while (Accumulator >= H && Result == EFightResult::Ongoing)
			{
				Accumulator -= H;
				Elapsed += H;
				const double Chord = (Fish.State.Position - Anchor).Length();
				Reel.Step(H, Chord, ReelInput);
				Fish.Step(H, Anchor, Reel.State.Tension, Water, Time + Elapsed);

				if (Reel.State.bSpooled) Result = EFightResult::Spooled;
				else if (Reel.State.bSnapped) Result = EFightResult::Snapped;
				else if ((Fish.State.Position - Anchor).Length() < Config.LandDistance) Result = EFightResult::Landed;
			}
			return Result;
		}

		/** Force the line exerts on whatever holds the rod (boat or player): pulls toward the fish. */
		Vec3 AnchorForce(const Vec3& Anchor) const
		{
			return (Fish.State.Position - Anchor).Normalized() * Reel.State.Tension;
		}

		EFightResult GetResult() const { return Result; }
		double GetElapsed() const { return Elapsed; }

		ReelModel Reel;
		FishAgent Fish;
		FightConfig Config;

	private:
		EFightResult Result = EFightResult::Ongoing;
		double Elapsed = 0.0;
		double Accumulator = 0.0;
	};
}
