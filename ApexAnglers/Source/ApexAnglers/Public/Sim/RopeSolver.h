// XPBD rope used to *draw* the fishing line (and later: abrasion contacts, GDD §7).
// Both ends are pinned to authoritative positions; interior points are free, so every client can
// reconstruct a plausible line locally from two replicated endpoints (GDD §8).
#pragma once

#include "ApexMath.h"
#include "WaveField.h"
#include <vector>

namespace apex::sim
{
	struct RopeParams
	{
		int Segments = 24;
		int Iterations = 10;
		double Compliance = 1e-7;   // m/N per segment (XPBD alpha); ~inextensible
		double WaterDamping = 6.0;  // 1/s velocity damping underwater
		double AirDamping = 0.3;    // 1/s
	};

	class RopeSolver
	{
	public:
		RopeParams Params;

		void Reset(const Vec3& Start, const Vec3& End, double RestLength)
		{
			const int N = (std::max)(2, Params.Segments);
			Points.assign(N + 1, Vec3());
			Previous.assign(N + 1, Vec3());
			for (int I = 0; I <= N; ++I)
			{
				const double T = static_cast<double>(I) / N;
				Points[I] = Start + (End - Start) * T;
				Previous[I] = Points[I];
			}
			SetRestLength(RestLength);
		}

		void SetRestLength(double RestLength) { SegmentRest = (std::max)(1e-4, RestLength) / (std::max)(1, Params.Segments); }
		void SetEndpoints(const Vec3& Start, const Vec3& End)
		{
			if (Points.empty()) return;
			Points.front() = Start; Previous.front() = Start;
			Points.back() = End; Previous.back() = End;
		}

		void Step(double Dt, const WaveField* Water, double Time)
		{
			if (Points.size() < 3 || Dt <= 0.0) return;
			const size_t N = Points.size() - 1;
			// Verlet predict (interior only; ends are pinned).
			for (size_t I = 1; I < N; ++I)
			{
				const bool bWet = Water && Points[I].Z < Water->HeightAt(Points[I].X, Points[I].Y, Time);
				const double Damp = std::exp(-(bWet ? Params.WaterDamping : Params.AirDamping) * Dt);
				const Vec3 Vel = (Points[I] - Previous[I]) * Damp;
				Previous[I] = Points[I];
				Points[I] += Vel + Vec3(0, 0, bWet ? -kGravity * 0.1 : -kGravity) * (Dt * Dt);
			}
			// XPBD distance constraints (one-sided: rope resists stretching, not compression).
			const double AlphaTilde = Params.Compliance / (Dt * Dt);
			std::vector<double> Lambda(N, 0.0);
			for (int Iter = 0; Iter < Params.Iterations; ++Iter)
			{
				for (size_t I = 0; I < N; ++I)
				{
					const double W0 = (I == 0) ? 0.0 : 1.0;
					const double W1 = (I + 1 == N) ? 0.0 : 1.0;
					if (W0 + W1 <= 0.0) continue;
					const Vec3 D = Points[I + 1] - Points[I];
					const double Len = D.Length();
					const double C = Len - SegmentRest;
					if (C <= 0.0 || Len < 1e-9) continue;
					const double DLambda = (-C - AlphaTilde * Lambda[I]) / (W0 + W1 + AlphaTilde);
					Lambda[I] += DLambda;
					const Vec3 Grad = D / Len;
					Points[I] -= Grad * (DLambda * W0);
					Points[I + 1] += Grad * (DLambda * W1);
				}
			}
		}

		const std::vector<Vec3>& GetPoints() const { return Points; }

		double CurrentLength() const
		{
			double L = 0.0;
			for (size_t I = 1; I < Points.size(); ++I) L += (Points[I] - Points[I - 1]).Length();
			return L;
		}

		double RestLength() const { return SegmentRest * (std::max)(1, Params.Segments); }

	private:
		std::vector<Vec3> Points;
		std::vector<Vec3> Previous;
		double SegmentRest = 0.5;
	};
}
