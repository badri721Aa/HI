#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ApexOceanVisual.generated.h"

class UInstancedStaticMeshComponent;

/**
 * Prototype sea surface: a grid of tiles that follows the camera and rides the exact same wave
 * function the physics uses, so what you see is what the boat floats on.
 * Milestone M1 replaces this with a Water plugin ocean tuned to the same Gerstner waves.
 */
UCLASS(NotPlaceable)
class APEXANGLERS_API AApexOceanVisual : public AActor
{
	GENERATED_BODY()

public:
	AApexOceanVisual();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

protected:
	UPROPERTY(VisibleAnywhere, Category = "Ocean")
	TObjectPtr<UInstancedStaticMeshComponent> Tiles;

	UPROPERTY(EditAnywhere, Category = "Ocean")
	int32 GridSize = 64;

	UPROPERTY(EditAnywhere, Category = "Ocean")
	float TileSizeCm = 500.f;

	UPROPERTY(EditAnywhere, Category = "Ocean")
	FLinearColor WaterColor = FLinearColor(0.02f, 0.18f, 0.26f);

private:
	TArray<FTransform> TileTransforms;
};
