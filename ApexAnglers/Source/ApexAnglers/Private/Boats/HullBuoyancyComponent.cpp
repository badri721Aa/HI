#include "Boats/HullBuoyancyComponent.h"
#include "World/ApexOceanSubsystem.h"
#include "Sim/HullModel.h"
#include "Sim/ApexUnreal.h"
#include "Components/PrimitiveComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

UHullBuoyancyComponent::UHullBuoyancyComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PrePhysics;
}

void UHullBuoyancyComponent::BuildBoxPontoons(const FVector& HullSizeCm, int32 Rows, int32 Cols)
{
	Pontoons.Reset();
	Rows = FMath::Max(1, Rows);
	Cols = FMath::Max(1, Cols);
	const double VolumeM3 = (HullSizeCm.X * HullSizeCm.Y * HullSizeCm.Z) * 1e-6 / (Rows * Cols);
	for (int32 R = 0; R < Rows; ++R)
	{
		for (int32 C = 0; C < Cols; ++C)
		{
			FApexPontoon P;
			P.LocalOffset = FVector(
				(-0.5 + (R + 0.5) / Rows) * HullSizeCm.X,
				(-0.5 + (C + 0.5) / Cols) * HullSizeCm.Y,
				0.0);
			P.VolumeM3 = static_cast<float>(VolumeM3);
			P.HeightCm = static_cast<float>(HullSizeCm.Z);
			Pontoons.Add(P);
		}
	}
}

void UHullBuoyancyComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	UPrimitiveComponent* Body = Cast<UPrimitiveComponent>(GetOwner() ? GetOwner()->GetRootComponent() : nullptr);
	const UApexOceanSubsystem* Ocean = GetWorld()->GetSubsystem<UApexOceanSubsystem>();
	if (!Body || !Ocean || !Body->IsSimulatingPhysics() || Pontoons.Num() == 0) return;

	const FVector Origin = Body->GetComponentLocation();
	const FQuat Rotation = Body->GetComponentQuat();

	// --- Buoyancy: F = rho * g * V_sub at each pontoon (applied off-center -> natural pitch & roll)
	double SubmergedSum = 0.0;
	for (const FApexPontoon& P : Pontoons)
	{
		const FVector World = Origin + Rotation.RotateVector(P.LocalOffset);
		const double WaterZ = Ocean->GetWaterHeight(World);
		const double BottomZ = World.Z - P.HeightCm * 0.5;
		apex::sim::Pontoon SimP;
		SimP.Volume = P.VolumeM3;
		SimP.Height = P.HeightCm * 0.01;
		const double Frac = apex::sim::SubmergedFraction(BottomZ * 0.01, SimP.Height, WaterZ * 0.01);
		SubmergedSum += Frac;
		if (Frac > 0.0)
		{
			const double Newtons = apex::sim::BuoyantForce(SimP, Frac);
			Body->AddForceAtLocation(FVector(0.0, 0.0, Newtons * apex::NewtonsToUnreal), World);
		}
	}
	SubmergedFraction = static_cast<float>(SubmergedSum / Pontoons.Num());
	if (SubmergedFraction <= 0.f) return;

	// --- Hull drag in the boat's local frame: slippery forward, keel resists sideways (GDD §22)
	apex::sim::HullParams Hull;
	Hull.CdAForward = CdAForward;
	Hull.CdALateral = CdALateral;
	Hull.CdAVertical = CdAVertical;
	const FVector LocalVelMs = Rotation.UnrotateVector(Body->GetPhysicsLinearVelocity()) * 0.01;
	const apex::sim::Vec3 Drag = apex::sim::HullDragLocal({ LocalVelMs.X, LocalVelMs.Y, LocalVelMs.Z }, Hull, LoadFactor);
	Body->AddForce(Rotation.RotateVector(FVector(Drag.X, Drag.Y, Drag.Z)) * (apex::NewtonsToUnreal * SubmergedFraction));

	// --- Rotational water damping (degrees/s -> rad/s)
	const FVector AngVel = FMath::DegreesToRadians(Body->GetPhysicsAngularVelocityInDegrees());
	Body->AddTorqueInRadians(-AngVel * (AngularDragNm * SubmergedFraction * apex::NewtonsToUnreal * 100.0));
}
