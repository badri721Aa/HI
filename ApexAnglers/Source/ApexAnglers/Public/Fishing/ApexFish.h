#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ApexFish.generated.h"

class UStaticMeshComponent;

/** Visual body of a hooked fish. The server drives its transform from the fight sim; it replicates to clients. */
UCLASS(NotPlaceable)
class APEXANGLERS_API AApexFish : public AActor
{
	GENERATED_BODY()

public:
	AApexFish();

	/** Server: place the fish, facing its direction of travel. */
	void UpdateFromSim(const FVector& Location, const FVector& Velocity);

protected:
	UPROPERTY(VisibleAnywhere, Category = "Fish")
	TObjectPtr<UStaticMeshComponent> Body;

	UPROPERTY(VisibleAnywhere, Category = "Fish")
	TObjectPtr<UStaticMeshComponent> Tail;
};
