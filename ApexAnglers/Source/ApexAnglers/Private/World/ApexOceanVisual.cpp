#include "World/ApexOceanVisual.h"
#include "World/ApexOceanSubsystem.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AApexOceanVisual::AApexOceanVisual()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostPhysics;
	bReplicates = false;

	Tiles = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Tiles"));
	SetRootComponent(Tiles);
	Tiles->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Tiles->SetMobility(EComponentMobility::Movable);
	Tiles->CastShadow = false;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Plane(TEXT("/Engine/BasicShapes/Plane.Plane"));
	if (Plane.Succeeded()) Tiles->SetStaticMesh(Plane.Object);
}

void AApexOceanVisual::BeginPlay()
{
	Super::BeginPlay();

	if (UMaterialInterface* Base = Tiles->GetMaterial(0))
	{
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, this);
		MID->SetVectorParameterValue(TEXT("Color"), WaterColor); // BasicShapeMaterial exposes "Color"
		Tiles->SetMaterial(0, MID);
	}

	TileTransforms.SetNum(GridSize * GridSize);
	const float Scale = TileSizeCm / 100.f * 1.02f; // engine plane is 100x100 cm; slight overlap hides seams
	for (FTransform& T : TileTransforms)
	{
		T.SetScale3D(FVector(Scale, Scale, 1.f));
		Tiles->AddInstance(T, /*bWorldSpace*/ true);
	}
}

void AApexOceanVisual::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	const UApexOceanSubsystem* Ocean = GetWorld()->GetSubsystem<UApexOceanSubsystem>();
	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!Ocean || !PC || !PC->PlayerCameraManager || TileTransforms.Num() == 0) return;

	// Snap the grid to whole tiles so the surface doesn't "swim" as the camera moves.
	const FVector Cam = PC->PlayerCameraManager->GetCameraLocation();
	const double OriginX = FMath::GridSnap(Cam.X, (double)TileSizeCm) - GridSize * 0.5 * TileSizeCm;
	const double OriginY = FMath::GridSnap(Cam.Y, (double)TileSizeCm) - GridSize * 0.5 * TileSizeCm;

	for (int32 Y = 0; Y < GridSize; ++Y)
	{
		for (int32 X = 0; X < GridSize; ++X)
		{
			FVector Center(OriginX + (X + 0.5) * TileSizeCm, OriginY + (Y + 0.5) * TileSizeCm, 0.0);
			Center.Z = Ocean->GetWaterHeight(Center);
			TileTransforms[Y * GridSize + X].SetLocation(Center);
		}
	}
	Tiles->BatchUpdateInstancesTransforms(0, TileTransforms, /*bWorldSpace*/ true, /*bMarkRenderStateDirty*/ true, /*bTeleport*/ true);
}
