#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Sim/WaveField.h"
#include "ApexOceanSubsystem.generated.h"

/**
 * Owns the analytic ocean surface. Server and clients evaluate the same wave function against
 * the replicated server clock, so buoyancy agrees everywhere without replicating water (GDD §5).
 */
UCLASS()
class APEXANGLERS_API UApexOceanSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;

	/** Water surface height (cm) at a world location. */
	double GetWaterHeight(const FVector& WorldLocation) const;

	/** True if the point is below the water surface. */
	bool IsUnderwater(const FVector& WorldLocation) const { return WorldLocation.Z < GetWaterHeight(WorldLocation); }

	/** Synced ocean clock (server world time on clients). */
	double GetOceanTime() const;

	const apex::sim::WaveField& GetWaveField() const { return Waves; }

private:
	apex::sim::WaveField Waves;
};
