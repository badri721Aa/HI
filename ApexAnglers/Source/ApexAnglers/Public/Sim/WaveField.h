// Analytic ocean surface. Server and clients evaluate the same function from the same replicated
// time, so buoyancy agrees everywhere without replicating any water state (GDD §5, §21).
// Tune these waves to match the Water plugin's Gerstner settings so visuals and physics line up.
#pragma once

#include "ApexMath.h"
#include <vector>

namespace apex::sim
{
	struct Wave
	{
		double DirectionRadians = 0.0; // travel direction in the XY plane
		double Amplitude = 0.5;        // m
		double Wavelength = 40.0;      // m
		double PhaseOffset = 0.0;      // rad
	};

	class WaveField
	{
	public:
		WaveField() { SetDefaultSeaState(); }

		void SetDefaultSeaState()
		{
			Waves = {
				{ 0.0, 0.45, 42.0, 0.0 },
				{ 0.9, 0.25, 23.0, 1.7 },
				{ -0.6, 0.12, 11.0, 4.1 },
			};
		}

		void SetWaves(std::vector<Wave> InWaves) { Waves = std::move(InWaves); }
		const std::vector<Wave>& GetWaves() const { return Waves; }

		/** Base sea level offset (tides, GDD §32). */
		double SeaLevel = 0.0;

		/** Surface height (m) at world XY (m) and time (s). Deep-water dispersion: w = sqrt(g k). */
		double HeightAt(double X, double Y, double Time) const
		{
			double H = SeaLevel;
			for (const Wave& W : Waves)
			{
				const double K = 2.0 * kPi / W.Wavelength;
				const double Omega = std::sqrt(kGravity * K);
				const double Along = X * std::cos(W.DirectionRadians) + Y * std::sin(W.DirectionRadians);
				H += W.Amplitude * std::sin(K * Along - Omega * Time + W.PhaseOffset);
			}
			return H;
		}

	private:
		std::vector<Wave> Waves;
	};
}
