// Apex Anglers — engine-agnostic simulation core.
// Everything in Public/Sim is plain C++20 with no Unreal includes, so it can be unit tested
// outside the editor (see /ApexAnglers/Tests) and runs identically on server and clients.
// Units: SI (meters, kilograms, seconds, newtons). Z is up (same as Unreal).
#pragma once

#include <cmath>
#include <algorithm>
#include <cstdint>

namespace apex::sim
{
	constexpr double kGravity = 9.81;          // m/s^2
	constexpr double kWaterDensity = 1025.0;   // kg/m^3 (sea water)
	constexpr double kAirDensity = 1.225;      // kg/m^3
	constexpr double kPi = 3.14159265358979323846;

	struct Vec3
	{
		double X = 0.0, Y = 0.0, Z = 0.0;

		constexpr Vec3() = default;
		constexpr Vec3(double InX, double InY, double InZ) : X(InX), Y(InY), Z(InZ) {}

		constexpr Vec3 operator+(const Vec3& O) const { return { X + O.X, Y + O.Y, Z + O.Z }; }
		constexpr Vec3 operator-(const Vec3& O) const { return { X - O.X, Y - O.Y, Z - O.Z }; }
		constexpr Vec3 operator-() const { return { -X, -Y, -Z }; }
		constexpr Vec3 operator*(double S) const { return { X * S, Y * S, Z * S }; }
		constexpr Vec3 operator/(double S) const { return { X / S, Y / S, Z / S }; }
		Vec3& operator+=(const Vec3& O) { X += O.X; Y += O.Y; Z += O.Z; return *this; }
		Vec3& operator-=(const Vec3& O) { X -= O.X; Y -= O.Y; Z -= O.Z; return *this; }
		Vec3& operator*=(double S) { X *= S; Y *= S; Z *= S; return *this; }

		constexpr double Dot(const Vec3& O) const { return X * O.X + Y * O.Y + Z * O.Z; }
		constexpr Vec3 Cross(const Vec3& O) const { return { Y * O.Z - Z * O.Y, Z * O.X - X * O.Z, X * O.Y - Y * O.X }; }
		double Length() const { return std::sqrt(Dot(*this)); }
		double LengthSquared() const { return Dot(*this); }
		Vec3 Normalized(const Vec3& Fallback = { 1, 0, 0 }) const
		{
			const double L = Length();
			return L > 1e-9 ? *this / L : Fallback;
		}
	};

	inline constexpr Vec3 operator*(double S, const Vec3& V) { return V * S; }

	inline double Clamp(double V, double Lo, double Hi) { return (std::min)((std::max)(V, Lo), Hi); }
	inline double Clamp01(double V) { return Clamp(V, 0.0, 1.0); }
	inline double Lerp(double A, double B, double T) { return A + (B - A) * T; }
	inline double SmoothStep(double Edge0, double Edge1, double X)
	{
		const double T = Clamp01((X - Edge0) / (Edge1 - Edge0));
		return T * T * (3.0 - 2.0 * T);
	}

	/** Quadratic drag force: F = -0.5 * rho * CdA * |v| * v */
	inline Vec3 QuadraticDrag(const Vec3& Velocity, double Density, double CdA)
	{
		return Velocity * (-0.5 * Density * CdA * Velocity.Length());
	}
}
