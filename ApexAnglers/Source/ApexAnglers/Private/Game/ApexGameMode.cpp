#include "Game/ApexGameMode.h"
#include "Boats/ApexBoat.h"
#include "Player/AnglerCharacter.h"
#include "ApexAnglers.h"
#include "Engine/World.h"
#include "GameFramework/Controller.h"

AApexGameMode::AApexGameMode()
{
	DefaultPawnClass = AAnglerCharacter::StaticClass();
}

AApexBoat* AApexGameMode::GetOrSpawnBoat()
{
	if (!CrewBoat)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		// Hull center 40 cm up: floats at ~20 cm draft (5 t on a 24 m^2 footprint).
		CrewBoat = GetWorld()->SpawnActor<AApexBoat>(AApexBoat::StaticClass(), FVector(0.0, 0.0, 40.0), FRotator::ZeroRotator, Params);
		UE_LOG(LogApex, Log, TEXT("Spawned crew boat %s"), *GetNameSafe(CrewBoat));
	}
	return CrewBoat;
}

void AApexGameMode::RestartPlayer(AController* NewPlayer)
{
	if (!NewPlayer || NewPlayer->IsPendingKillPending()) return;

	AApexBoat* Boat = GetOrSpawnBoat();
	if (!Boat)
	{
		Super::RestartPlayer(NewPlayer);
		return;
	}
	// Spread the crew along the deck: up to 4 spots.
	const int32 Slot = SpawnCounter++ % 4;
	const FVector Local(150.0 - Slot * 100.0, (Slot % 2 == 0) ? -70.0 : 70.0, 170.0);
	const FTransform Spawn(Boat->GetActorRotation(), Boat->GetActorLocation() + Boat->GetActorRotation().RotateVector(Local));
	RestartPlayerAtTransform(NewPlayer, Spawn);
}
