// Bridge between the engine-agnostic sim core (meters, newtons) and Unreal (centimeters).
#pragma once

#include "CoreMinimal.h"
#include "Sim/ApexMath.h"

namespace apex
{
	/** Unreal forces are kg*cm/s^2, so 1 N = 100 Unreal force units. */
	constexpr double NewtonsToUnreal = 100.0;

	inline sim::Vec3 ToSim(const FVector& Cm) { return { Cm.X * 0.01, Cm.Y * 0.01, Cm.Z * 0.01 }; }
	inline FVector ToUnreal(const sim::Vec3& M) { return FVector(M.X * 100.0, M.Y * 100.0, M.Z * 100.0); }
	inline FVector ForceToUnreal(const sim::Vec3& Newtons) { return FVector(Newtons.X, Newtons.Y, Newtons.Z) * NewtonsToUnreal; }
}
