// Deterministic random numbers. Every gameplay roll (fish weight, bite time, loot) goes through
// this, seeded from the voyage seed, so the server's results can be re-derived and audited (GDD §41).
#pragma once

#include <cstdint>
#include <cmath>

namespace apex::sim
{
	class SeededRng
	{
	public:
		explicit SeededRng(uint64_t Seed = 0x9E3779B97F4A7C15ull) : State(Seed) {}

		/** SplitMix64 — tiny, fast, statistically solid for gameplay. */
		uint64_t NextU64()
		{
			uint64_t Z = (State += 0x9E3779B97F4A7C15ull);
			Z = (Z ^ (Z >> 30)) * 0xBF58476D1CE4E5B9ull;
			Z = (Z ^ (Z >> 27)) * 0x94D049BB133111EBull;
			return Z ^ (Z >> 31);
		}

		/** Uniform in [0, 1). */
		double NextDouble() { return static_cast<double>(NextU64() >> 11) * (1.0 / 9007199254740992.0); }

		double Range(double Lo, double Hi) { return Lo + (Hi - Lo) * NextDouble(); }

		/** Exponentially distributed wait time with the given mean (used for bite latency). */
		double Exponential(double Mean) { return -Mean * std::log(1.0 - NextDouble()); }

		/** Derive an independent stream, e.g. Derive(ChunkHash) or Derive(SpawnId). */
		SeededRng Derive(uint64_t Salt) const
		{
			SeededRng Copy(State ^ (Salt * 0xD1B54A32D192ED03ull));
			Copy.NextU64();
			return Copy;
		}

		uint64_t GetState() const { return State; }

	private:
		uint64_t State;
	};
}
