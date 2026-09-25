#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "ApexGameMode.generated.h"

class AApexBoat;

/** M0 game mode: spawns the crew boat and puts every joining player (max 4) on its deck. */
UCLASS()
class APEXANGLERS_API AApexGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AApexGameMode();

	virtual void RestartPlayer(AController* NewPlayer) override;

protected:
	AApexBoat* GetOrSpawnBoat();

	UPROPERTY(Transient)
	TObjectPtr<AApexBoat> CrewBoat;

	int32 SpawnCounter = 0;
};
