#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "HullBuoyancyComponent.generated.h"

/** One buoyancy sample point (one per hull tile once the raft grid lands, GDD §21). */
USTRUCT(BlueprintType)
struct FApexPontoon
{
	GENERATED_BODY()

	/** Offset from the hull body's origin, in the body's rotation frame (cm, unscaled). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Buoyancy")
	FVector LocalOffset = FVector::ZeroVector;

	/** Displaced volume when fully submerged (m^3). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Buoyancy")
	float VolumeM3 = 1.f;

	/** Vertical extent used for partial submersion (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Buoyancy")
	float HeightCm = 100.f;
};

/**
 * Applies Archimedes buoyancy per pontoon plus hull drag (forward / keel-lateral / heave) to the
 * owner's root physics body. Runs on server AND clients with identical inputs (same wave function,
 * synced clock) so client physics stays close to the server and corrections stay tiny.
 */
UCLASS(ClassGroup = (Apex), meta = (BlueprintSpawnableComponent))
class APEXANGLERS_API UHullBuoyancyComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHullBuoyancyComponent();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Fill Pontoons with a Rows x Cols grid covering a box hull. */
	void BuildBoxPontoons(const FVector& HullSizeCm, int32 Rows, int32 Cols);

	/** Average submerged fraction last tick (0 = flying, 1 = sunk). */
	float GetSubmergedFraction() const { return SubmergedFraction; }

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Buoyancy")
	TArray<FApexPontoon> Pontoons;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Hydrodynamics")
	float CdAForward = 0.6f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Hydrodynamics")
	float CdALateral = 5.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Hydrodynamics")
	float CdAVertical = 12.f;

	/** Water resistance to rolling/pitching/yawing (N*m per rad/s), scaled by submersion. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Hydrodynamics")
	float AngularDragNm = 20000.f;

	/** Cargo / flooding load factor: >1 makes the hull slide in turns (GDD §22). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Hydrodynamics")
	float LoadFactor = 1.f;

private:
	float SubmergedFraction = 0.f;
};
