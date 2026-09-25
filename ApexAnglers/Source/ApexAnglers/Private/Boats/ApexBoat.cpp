#include "Boats/ApexBoat.h"
#include "Boats/HullBuoyancyComponent.h"
#include "World/ApexOceanSubsystem.h"
#include "Sim/HullModel.h"
#include "Sim/ApexUnreal.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"

AApexBoat::AApexBoat()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;
	bReplicates = true;
	SetReplicateMovement(true);
	bAlwaysRelevant = true; // it's the crew's home; always stream it
	SetNetUpdateFrequency(60.f);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));

	Hull = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Hull"));
	SetRootComponent(Hull);
	if (Cube.Succeeded()) Hull->SetStaticMesh(Cube.Object);
	Hull->SetRelativeScale3D(HullSize / 100.0); // engine cube is 100 cm
	Hull->SetCollisionProfileName(UCollisionProfile::PhysicsActor_ProfileName);
	Hull->SetSimulatePhysics(true);
	Hull->SetLinearDamping(0.02f);
	Hull->SetAngularDamping(0.3f);
	Hull->BodyInstance.bUseCCD = true;

	Cabin = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Cabin"));
	Cabin->SetupAttachment(Hull);
	if (Cube.Succeeded()) Cabin->SetStaticMesh(Cube.Object);
	Cabin->SetCollisionEnabled(ECollisionEnabled::NoCollision); // visual only in M0 (avoids welding mass)
	// Relative transforms are in the scaled hull's space: place a 2m x 2.2m x 1.8m cabin at the stern.
	Cabin->SetRelativeLocation(FVector(-0.25, 0.0, 1.25));
	Cabin->SetRelativeScale3D(FVector(200.0 / HullSize.X, 220.0 / HullSize.Y, 180.0 / HullSize.Z));

	Helm = CreateDefaultSubobject<USceneComponent>(TEXT("Helm"));
	Helm->SetupAttachment(Hull);
	Helm->SetRelativeLocation(FVector(-0.08, 0.0, 0.5));

	Buoyancy = CreateDefaultSubobject<UHullBuoyancyComponent>(TEXT("Buoyancy"));
}

void AApexBoat::BeginPlay()
{
	Super::BeginPlay();
	Hull->SetMassOverrideInKg(NAME_None, MassKg, true);
	Buoyancy->BuildBoxPontoons(HullSize, 4, 2);
}

void AApexBoat::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AApexBoat, Throttle);
	DOREPLIFETIME(AApexBoat, Rudder);
}

void AApexBoat::SetControls(float InThrottle, float InRudder)
{
	if (!HasAuthority()) return;
	Throttle = FMath::Clamp(InThrottle, -0.5f, 1.f); // reverse is weaker
	Rudder = FMath::Clamp(InRudder, -1.f, 1.f);
}

void AApexBoat::AddExternalForceAtLocation(const FVector& ForceNewtons, const FVector& WorldLocation)
{
	if (!HasAuthority()) return;
	Hull->AddForceAtLocation(ForceNewtons * apex::NewtonsToUnreal, WorldLocation);
}

FVector AApexBoat::GetHelmLocation() const
{
	return Helm->GetComponentLocation();
}

void AApexBoat::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Hull->IsSimulatingPhysics() || Buoyancy->GetSubmergedFraction() <= 0.f) return;

	// Propeller at the stern, only bites when the stern is in the water.
	const FQuat Rot = Hull->GetComponentQuat();
	const FVector Forward = Rot.GetForwardVector();
	const FVector Stern = Hull->GetComponentLocation() - Forward * (HullSize.X * 0.45);
	const UApexOceanSubsystem* Ocean = GetWorld()->GetSubsystem<UApexOceanSubsystem>();
	const bool bPropWet = Ocean && Stern.Z - HullSize.Z * 0.5 < Ocean->GetWaterHeight(Stern);
	if (!bPropWet) return;

	const double ForwardSpeed = FVector::DotProduct(Hull->GetPhysicsLinearVelocity(), Forward) * 0.01;
	Hull->AddForceAtLocation(Forward * (Throttle * MaxThrustN * apex::NewtonsToUnreal), Stern);

	apex::sim::HullParams Params;
	Params.RudderLift = RudderLift;
	const double Side = apex::sim::RudderForce(ForwardSpeed, Throttle, Rudder, Params);
	Hull->AddForceAtLocation(Rot.GetRightVector() * (-Side * apex::NewtonsToUnreal), Stern);
}
