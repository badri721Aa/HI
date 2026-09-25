#include "World/ApexOceanSubsystem.h"
#include "World/ApexOceanVisual.h"
#include "Engine/World.h"
#include "GameFramework/GameStateBase.h"

void UApexOceanSubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	// Each non-dedicated machine spawns its own (non-replicated) visual sea surface.
	if (InWorld.GetNetMode() != NM_DedicatedServer && InWorld.IsGameWorld())
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		InWorld.SpawnActor<AApexOceanVisual>(AApexOceanVisual::StaticClass(), FTransform::Identity, Params);
	}
}

double UApexOceanSubsystem::GetOceanTime() const
{
	const UWorld* World = GetWorld();
	if (!World) return 0.0;
	if (const AGameStateBase* GameState = World->GetGameState())
	{
		return GameState->GetServerWorldTimeSeconds();
	}
	return World->GetTimeSeconds();
}

double UApexOceanSubsystem::GetWaterHeight(const FVector& WorldLocation) const
{
	// Sim works in meters; Unreal in centimeters.
	return Waves.HeightAt(WorldLocation.X * 0.01, WorldLocation.Y * 0.01, GetOceanTime()) * 100.0;
}
