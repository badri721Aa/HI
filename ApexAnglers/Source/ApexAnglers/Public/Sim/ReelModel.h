// Rod + reel + line tension model (GDD §6: The Kinetic Rod Simulation).
#pragma once

#include "ApexMath.h"

namespace apex::sim
{
	/** Rod blank as a clamped cantilever. The rod bends before the line stretches, absorbing shock loads. */
	struct RodParams
	{
		double Length = 2.4;          // m
		double FlexuralRigidity = 1850.0; // E*I (N*m^2) -> k_rod = 3EI/L^3 ~= 400 N/m
		double MaxDeflection = 0.9;   // m of tip travel before the blank is fully loaded
		double MaxTipAngle = 1.2;     // rad

		double Stiffness() const { return 3.0 * FlexuralRigidity / (Length * Length * Length); }
		/** delta_tip = T L^3 / (3 E I), clamped: the rod "gives" this much line under load. */
		double TipDeflection(double Tension) const { return Clamp(Tension / Stiffness(), 0.0, MaxDeflection); }
		/** theta_tip = T L^2 / (2 E I), drives the bend blend-shape / animation. */
		double TipAngle(double Tension) const { return Clamp(Tension * Length * Length / (2.0 * FlexuralRigidity), 0.0, MaxTipAngle); }
	};

	struct ReelParams
	{
		double LineStiffness = 25000.0;  // E*A: newtons per unit strain (braided line)
		double LineDamping = 120.0;      // newtons per unit strain-rate
		double BreakStrength = 900.0;    // N
		double ReelSpeed = 1.6;          // m/s of line recovered at full reel input (omega * r)
		double DragSlipDamping = 40.0;   // N*s/m: extra tension per m/s of slip (drag stays near its setting)
		double MaxLine = 150.0;          // m on the spool
		double MinLine = 0.5;            // m
		double HeatGain = 0.004;          // mu_drag: heat per (N * m/s) of slipping
		double HeatCooling = 0.25;       // kappa: 1/s
		double HeatWarn = 60.0;
		double HeatMax = 100.0;
		double SnapGrace = 0.08;         // s above break strength before snapping
		double InstantSnapFactor = 1.5;  // above this multiple of break strength: snap immediately
	};

	struct ReelState
	{
		double LineOut = 10.0;       // L_spool (m)
		double Tension = 0.0;        // T (N)
		double Heat = 0.0;           // H
		double DragSetting = 600.0;  // D_set (N)
		double Strain = 0.0;
		double OverloadTime = 0.0;
		double SlipSpeed = 0.0;      // m/s currently paying out
		bool bSnapped = false;
		bool bSpooled = false;       // ran out of line
	};

	class ReelModel
	{
	public:
		ReelParams Params;
		RodParams Rod;
		ReelState State;

		void Reset(double InitialLine, double DragSetting)
		{
			State = ReelState{};
			State.LineOut = Clamp(InitialLine, Params.MinLine, Params.MaxLine);
			State.DragSetting = DragSetting;
		}

		/** T_break' = T_break * (1 - 0.6 * smoothstep(H_warn, H_max, H)): a hot reel weakens the line. */
		double EffectiveBreakStrength() const
		{
			return Params.BreakStrength * (1.0 - 0.6 * SmoothStep(Params.HeatWarn, Params.HeatMax, State.Heat));
		}

		double TensionRatio() const { return State.Tension / (std::max)(1.0, EffectiveBreakStrength()); }

		/** Cool the reel instantly (a teammate splashing water on it, GDD §6). */
		void Douse(double Fraction = 0.4) { State.Heat *= (1.0 - Fraction); }

		/**
		 * Advance one step.
		 * @param ChordDistance straight-line distance rod tip -> hook (m)
		 * @param ReelInput     0..1 how hard the player is cranking
		 */
		void Step(double Dt, double ChordDistance, double ReelInput)
		{
			if (State.bSnapped || Dt <= 0.0) return;
			ReelState& S = State;

			// Rod blank and line act as two springs in series: the rod bends first (k_rod), the line
			// stretches (k_line = EA / L). Solved in closed form so there is no lag or oscillation.
			const double Slack = ChordDistance - S.LineOut;          // > 0 means the system is loaded
			const double KLine = Params.LineStiffness / S.LineOut;
			const double KRod = Rod.Stiffness();
			double Elastic = 0.0;
			if (Slack > 0.0)
			{
				Elastic = Slack * (KLine * KRod) / (KLine + KRod);
				if (Elastic / KRod > Rod.MaxDeflection) Elastic = KLine * (Slack - Rod.MaxDeflection); // blank maxed out
			}
			const double NewStrain = Elastic / Params.LineStiffness;
			const double StrainRate = (NewStrain - S.Strain) / Dt;
			S.Strain = NewStrain;
			S.Tension = (std::max)(0.0, Elastic + (NewStrain > 0.0 ? Params.LineDamping * StrainRate : 0.0));

			// Drag clutch: above the drag setting the spool slips and pays out line.
			if (S.Tension > S.DragSetting)
			{
				S.SlipSpeed = (S.Tension - S.DragSetting) / Params.DragSlipDamping;
				S.LineOut += S.SlipSpeed * Dt;
			}
			else
			{
				S.SlipSpeed = 0.0;
				S.LineOut -= Params.ReelSpeed * Clamp01(ReelInput) * Dt;
			}
			if (S.LineOut >= Params.MaxLine) { S.LineOut = Params.MaxLine; S.bSpooled = true; }
			S.LineOut = (std::max)(S.LineOut, Params.MinLine);

			// Friction heat: dH/dt = mu * T * |slip| - kappa * (H - H_ambient)
			S.Heat += (Params.HeatGain * S.Tension * S.SlipSpeed - Params.HeatCooling * S.Heat) * Dt;
			S.Heat = Clamp(S.Heat, 0.0, Params.HeatMax);

			// Break check with a short grace window.
			const double Break = EffectiveBreakStrength();
			if (S.Tension > Break * Params.InstantSnapFactor) S.bSnapped = true;
			else if (S.Tension > Break)
			{
				S.OverloadTime += Dt;
				if (S.OverloadTime > Params.SnapGrace) S.bSnapped = true;
			}
			else S.OverloadTime = 0.0;
			if (S.bSpooled) S.bSnapped = true;
		}

		/** Elastic energy released when the line snaps: 1/2 k eps^2 L (drives the whip-back impulse). */
		double SnapEnergy() const { return 0.5 * Params.LineStiffness * State.Strain * State.Strain * State.LineOut; }
	};
}
