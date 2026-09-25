#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ApexBoat.generated.h"

class UStaticMeshComponent;
class UHullBuoyancyComponent;

/**
 * Prototype boat (M0): a 5-ton box hull with buoyancy, propeller thrust and a rudder.
 * Becomes the modular tile-grid hull in M1 (GDD §21).
 *
 * Authority: the server owns controls and external forces (fish on the line). Clients simulate the
 * same buoyancy/drag/thrust locally from replicated controls, and Unreal's physics replication
 * corrects them toward the server state.
 */
UCLASS()
class APEXANGLERS_API AApexBoat : public AActor
{
	GENERATED_BODY()

public:
	AApexBoat();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	/** Server only: set helm controls (-1..1). Called by the character at the helm after validation. */
	void SetControls(float InThrottle, float InRudder);

	/** Server only: e.g. a hooked leviathan pulling on a rod held on deck (GDD §10). Force in newtons. */
	void AddExternalForceAtLocation(const FVector& ForceNewtons, const FVector& WorldLocation);

	FVector GetHelmLocation() const;
	UStaticMeshComponent* GetHull() const { return Hull; }

protected:
	UPROPERTY(VisibleAnywhere, Category = "Boat")
	TObjectPtr<UStaticMeshComponent> Hull;

	UPROPERTY(VisibleAnywhere, Category = "Boat")
	TObjectPtr<UStaticMeshComponent> Cabin;

	UPROPERTY(VisibleAnywhere, Category = "Boat")
	TObjectPtr<USceneComponent> Helm;

	UPROPERTY(VisibleAnywhere, Category = "Boat")
	TObjectPtr<UHullBuoyancyComponent> Buoyancy;

	/** Hull box size (cm): 8 m x 3 m x 1.2 m. */
	UPROPERTY(EditDefaultsOnly, Category = "Boat")
	FVector HullSize = FVector(800.0, 300.0, 120.0);

	UPROPERTY(EditDefaultsOnly, Category = "Boat")
	float MassKg = 5000.f;

	UPROPERTY(EditDefaultsOnly, Category = "Boat")
	float MaxThrustN = 24000.f;

	UPROPERTY(EditDefaultsOnly, Category = "Boat")
	float RudderLift = 400.f;

	UPROPERTY(Replicated)
	float Throttle = 0.f;

	UPROPERTY(Replicated)
	float Rudder = 0.f;
};
