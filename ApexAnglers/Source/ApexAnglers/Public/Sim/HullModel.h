// Boat hydrostatics + hydrodynamics (GDD §21-22). Pure functions; the Unreal hull component samples
// pontoons in world space and applies the resulting forces to the physics body.
#pragma once

#include "ApexMath.h"

namespace apex::sim
{
	/** A buoyancy sample point on the hull (one per hull tile later, GDD §21). */
	struct Pontoon
	{
		Vec3 LocalOffset;       // m, from the hull's center of mass
		double Volume = 1.0;    // m^3 displaced when fully submerged
		double Height = 1.0;    // m, vertical extent used for partial submersion
	};

	struct HullParams
	{
		double Mass = 5000.0;         // kg
		double CdAForward = 0.6;      // m^2  (C_x * A_x)
		double CdALateral = 5.0;      // m^2  keel resists sliding (~8x forward)
		double CdAVertical = 12.0;    // m^2  heave damping
		double MaxThrust = 24000.0;   // N
		double RudderLift = 400.0;    // N per (m/s)^2 of flow at full rudder
		double LoadFactorGripExp = 0.7;
	};

	/** Fraction of a pontoon under water: 0 = dry, 1 = fully submerged. */
	inline double SubmergedFraction(double BottomZ, double Height, double WaterZ)
	{
		return Clamp01((WaterZ - BottomZ) / (std::max)(1e-6, Height));
	}

	/** Archimedes: F_b = rho * g * V_sub (N, upward). */
	inline double BuoyantForce(const Pontoon& P, double SubmergedFrac)
	{
		return kWaterDensity * kGravity * P.Volume * SubmergedFrac;
	}

	/**
	 * Hull drag in the boat's local frame (X forward, Y right, Z up), velocity in m/s.
	 * Lateral grip drops with load: C_y_eff = C_y * (1/LF)^0.7 -> loaded boats drift (GDD §22).
	 */
	inline Vec3 HullDragLocal(const Vec3& LocalVelocity, const HullParams& H, double LoadFactor = 1.0)
	{
		const double Grip = std::pow(1.0 / (std::max)(0.2, LoadFactor), H.LoadFactorGripExp);
		return {
			-0.5 * kWaterDensity * H.CdAForward * std::abs(LocalVelocity.X) * LocalVelocity.X,
			-0.5 * kWaterDensity * H.CdALateral * Grip * std::abs(LocalVelocity.Y) * LocalVelocity.Y,
			-0.5 * kWaterDensity * H.CdAVertical * std::abs(LocalVelocity.Z) * LocalVelocity.Z,
		};
	}

	/** Steady-state speed when something (a leviathan) tows the hull: v = sqrt(T / (0.5 rho CdA)). */
	inline double SteadyTowSpeed(double TowForce, double CdA)
	{
		return std::sqrt((std::max)(0.0, TowForce) / (0.5 * kWaterDensity * CdA));
	}

	/** Rudder side force; prop wash keeps the rudder working at low speed. */
	inline double RudderForce(double ForwardSpeed, double Throttle, double Rudder01, const HullParams& H)
	{
		const double Wash = 2.0 * std::abs(Throttle);
		const double Flow = std::abs(ForwardSpeed) + Wash;
		return H.RudderLift * Flow * Flow * Clamp(Rudder01, -1.0, 1.0);
	}
}
