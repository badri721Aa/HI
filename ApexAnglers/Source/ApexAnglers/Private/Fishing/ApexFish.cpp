#include "Fishing/ApexFish.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

AApexFish::AApexFish()
{
	PrimaryActorTick.bCanEverTick = false;
	bReplicates = true;
	SetReplicateMovement(true);
	SetNetUpdateFrequency(30.f);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cone(TEXT("/Engine/BasicShapes/Cone.Cone"));

	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	SetRootComponent(Body);
	if (Sphere.Succeeded()) Body->SetStaticMesh(Sphere.Object);
	Body->SetRelativeScale3D(FVector(1.1, 0.45, 0.6)); // ~1.1 m long placeholder
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Tail = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Tail"));
	Tail->SetupAttachment(Body);
	if (Cone.Succeeded()) Tail->SetStaticMesh(Cone.Object);
	Tail->SetRelativeLocation(FVector(-60.0, 0.0, 0.0));
	Tail->SetRelativeRotation(FRotator(90.0, 0.0, 0.0));
	Tail->SetRelativeScale3D(FVector(0.5, 0.9, 0.4));
	Tail->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AApexFish::UpdateFromSim(const FVector& Location, const FVector& Velocity)
{
	const FRotator Facing = Velocity.SizeSquared() > 100.0 ? Velocity.Rotation() : GetActorRotation();
	SetActorLocationAndRotation(Location, Facing);
}
