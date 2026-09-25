// Hooked fish as a physical agent choosing force vectors (GDD §7: Active Tug-of-War Engine).
#pragma once

#include "ApexMath.h"
#include "SeededRng.h"
#include "WaveField.h"

namespace apex::sim
{
	enum class EFishBehavior : uint8_t { Headshake, Run, Dive, Circle, Breach, Exhausted };

	inline const char* ToString(EFishBehavior B)
	{
		switch (B)
		{
		case EFishBehavior::Headshake: return "Headshake";
		case EFishBehavior::Run: return "Run";
		case EFishBehavior::Dive: return "Dive";
		case EFishBehavior::Circle: return "Circle";
		case EFishBehavior::Breach: return "Breach";
		case EFishBehavior::Exhausted: return "Exhausted";
		}
		return "?";
	}

	struct FishSpecies
	{
		double Mass = 14.0;          // kg
		double MaxForce = 420.0;     // S_max (N)
		double Energy = 5200.0;      // E_fish (J): mechanical work it can do before exhaustion
		double Recovery = 0.05;      // stamina/s regained when line tension is low
		double CdA = 0.03;           // m^2 drag area
		double CruiseDepth = 2.5;    // m below surface it prefers
		double BreachSpeed = 8.0;    // m/s launch speed for jumps
		double HeadshakeHz = 5.0;
		double StaminaFloor = 0.15;  // fish never go fully limp
	};

	struct FishState
	{
		Vec3 Position;
		Vec3 Velocity;
		double Stamina = 1.0;
		EFishBehavior Behavior = EFishBehavior::Headshake;
		double BehaviorTimeLeft = 1.5;
		double TimeHooked = 0.0;
		bool bAirborne = false;
		Vec3 LastSwimForce;
	};

	class FishAgent
	{
	public:
		FishSpecies Species;
		FishState State;

		void Reset(const FishSpecies& InSpecies, const Vec3& Position, uint64_t Seed)
		{
			Species = InSpecies;
			State = FishState{};
			State.Position = Position;
			Rng = SeededRng(Seed);
		}

		/**
		 * @param Anchor      rod tip position (m)
		 * @param LineTension current tension (N), pulls the fish toward the anchor
		 */
		void Step(double Dt, const Vec3& Anchor, double LineTension, const WaveField& Water, double Time)
		{
			FishState& S = State;
			S.TimeHooked += Dt;
			const double Surface = Water.HeightAt(S.Position.X, S.Position.Y, Time);
			const bool bSubmerged = S.Position.Z < Surface;

			S.BehaviorTimeLeft -= Dt;
			if (S.BehaviorTimeLeft <= 0.0 && bSubmerged) ChooseBehavior(S.Position.Z, Surface);

			const Vec3 ToFish = S.Position - Anchor;
			const Vec3 Away = Vec3(ToFish.X, ToFish.Y, 0.0).Normalized({ 1, 0, 0 });
			const Vec3 Up(0, 0, 1);

			Vec3 SwimDir;
			switch (S.Behavior)
			{
			case EFishBehavior::Headshake:
			{
				const double A = std::sin(S.TimeHooked * 2.0 * kPi * Species.HeadshakeHz) * (kPi / 3.0);
				const Vec3 Side = Up.Cross(Away);
				SwimDir = Away * std::cos(A) + Side * std::sin(A);
				break;
			}
			case EFishBehavior::Run: SwimDir = Away; break;
			case EFishBehavior::Dive: SwimDir = (Away * 0.3 - Up).Normalized(); break;
			case EFishBehavior::Circle: SwimDir = (Up.Cross(Away) + Away * 0.2).Normalized(); break;
			case EFishBehavior::Breach: SwimDir = (Up + Away * 0.3).Normalized(); break;
			case EFishBehavior::Exhausted: SwimDir = Away; break;
			}

			const double Effort = (std::max)(Species.StaminaFloor, S.Stamina) * (S.Behavior == EFishBehavior::Exhausted ? 0.5 : 1.0);
			Vec3 Swim = bSubmerged ? SwimDir * (Species.MaxForce * Effort) : Vec3();

			// Stay at cruise depth unless breaching.
			if (bSubmerged && S.Behavior != EFishBehavior::Breach)
			{
				const double Depth = Surface - S.Position.Z;
				// Too shallow (Depth < CruiseDepth) -> push down; too deep -> push up.
				Swim.Z += Clamp((Depth - Species.CruiseDepth) * 40.0, -Species.MaxForce, Species.MaxForce) * 0.5;
			}

			// Breach: kick upward once close to the surface -> airborne arc.
			if (S.Behavior == EFishBehavior::Breach && bSubmerged && Surface - S.Position.Z < 0.6 && S.Velocity.Z > 0.0)
			{
				S.Velocity.Z = (std::max)(S.Velocity.Z, Species.BreachSpeed);
				S.Behavior = EFishBehavior::Run;
				S.BehaviorTimeLeft = 1.5;
			}

			const Vec3 LineDir = (Anchor - S.Position).Normalized({ 0, 0, 1 });
			Vec3 Force = Swim + LineDir * LineTension
				+ QuadraticDrag(S.Velocity, bSubmerged ? kWaterDensity : kAirDensity, Species.CdA);
			if (!bSubmerged) Force.Z -= Species.Mass * kGravity; // neutrally buoyant underwater

			S.Velocity += Force * (Dt / Species.Mass);
			S.Position += S.Velocity * Dt;
			S.bAirborne = !bSubmerged;
			S.LastSwimForce = Swim;

			// dSigma/dt = -P/E where P = mechanical power output; recover when the line is slack.
			const double Power = (std::max)(0.0, Swim.Dot(S.Velocity));
			S.Stamina -= Power / Species.Energy * Dt;
			if (LineTension < 0.2 * Species.MaxForce) S.Stamina += Species.Recovery * Dt;
			S.Stamina = Clamp01(S.Stamina);
		}

	private:
		SeededRng Rng;

		void ChooseBehavior(double Z, double Surface)
		{
			FishState& S = State;
			if (S.TimeHooked < 1.5) { S.Behavior = EFishBehavior::Headshake; S.BehaviorTimeLeft = 1.5 - S.TimeHooked; return; }
			if (S.Stamina <= Species.StaminaFloor + 0.05) { S.Behavior = EFishBehavior::Exhausted; S.BehaviorTimeLeft = 2.0; return; }

			const double Depth = Surface - Z;
			const double WRun = 3.0;
			const double WDive = Depth < Species.CruiseDepth * 2.0 ? 2.0 : 0.3;
			const double WCircle = 1.5;
			const double WBreach = S.Stamina > 0.6 ? 1.0 : 0.0;
			double R = Rng.NextDouble() * (WRun + WDive + WCircle + WBreach);
			if ((R -= WRun) < 0.0) S.Behavior = EFishBehavior::Run;
			else if ((R -= WDive) < 0.0) S.Behavior = EFishBehavior::Dive;
			else if ((R -= WCircle) < 0.0) S.Behavior = EFishBehavior::Circle;
			else S.Behavior = EFishBehavior::Breach;
			S.BehaviorTimeLeft = Rng.Range(1.0, 3.0);
		}
	};
}
