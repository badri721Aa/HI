#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Engine/NetSerialization.h"
#include "Sim/FishFight.h"
#include "Sim/RopeSolver.h"
#include "Sim/SeededRng.h"
#include "FishingRodComponent.generated.h"

class AApexFish;

UENUM(BlueprintType)
enum class ERodState : uint8
{
	Idle,
	Casting,   // lure in flight
	Waiting,   // bobber in the water
	Bite,      // hook-set window open
	Fighting,  // tug-of-war
	Cooldown,
};

/**
 * Compact replicated line state (GDD §8). Only endpoints + scalars are sent; every machine rebuilds
 * the rope curve locally with the XPBD solver.
 */
USTRUCT()
struct FLineNetState
{
	GENERATED_BODY()

	UPROPERTY() ERodState State = ERodState::Idle;
	UPROPERTY() FVector_NetQuantize10 HookLocation = FVector::ZeroVector;
	UPROPERTY() float LineOutCm = 0.f;
	UPROPERTY() uint8 Tension = 0;      // 0..255 -> 0..1.25 x effective break strength
	UPROPERTY() uint8 Heat = 0;         // 0..255 -> 0..HeatMax
	UPROPERTY() uint8 FishStamina = 0;  // 0..255
	UPROPERTY() uint8 DragPercent = 0;  // drag setting as % of break strength
};

/**
 * Server-authoritative fishing rod. Clients send intents only (cast aim, reel input, drag setting);
 * the server runs the fight simulation and rolls every random outcome (GDD §41).
 */
UCLASS(ClassGroup = (Apex), meta = (BlueprintSpawnableComponent))
class APEXANGLERS_API UFishingRodComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UFishingRodComponent();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	// --- Local player API (safe to call on the owning client)
	void RequestCast(const FVector& AimDirection, float Power01);
	void SetReelInput(float Input01);
	void AdjustDrag(float DeltaPercent);

	ERodState GetState() const { return Net.State; }
	float GetTensionRatio() const { return Net.Tension / 255.f * 1.25f; }

	// --- Tuning (DataAsset-driven in M1)
	UPROPERTY(EditAnywhere, Category = "Fishing")
	float MaxCastSpeed = 22.f; // m/s

	UPROPERTY(EditAnywhere, Category = "Fishing")
	float MeanBiteSeconds = 6.f;

	UPROPERTY(EditAnywhere, Category = "Fishing")
	float BiteWindowSeconds = 0.8f;

	UPROPERTY(EditAnywhere, Category = "Fishing")
	float CooldownSeconds = 1.5f;

	/** How much of the line pull reaches a player standing on land (boats take 100%). */
	UPROPERTY(EditAnywhere, Category = "Fishing")
	float OnFootPullScale = 0.25f;

protected:
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerCast(FVector_NetQuantizeNormal AimDirection, float Power01);

	UFUNCTION(Server, Reliable, WithValidation) // only sent on press/release, must not be lost
	void ServerSetReel(float Input01);

	UFUNCTION(Server, Reliable, WithValidation)
	void ServerSetDrag(float InDragPercent);

	UFUNCTION(Client, Reliable)
	void ClientFightResult(uint8 Result, float WeightKg, float Seconds);

	UPROPERTY(Replicated)
	FLineNetState Net;

private:
	void TickServer(float Dt);
	void TickVisuals(float Dt);
	void StartFight();
	void EndFight(apex::sim::EFightResult Result);
	void PublishNetState();
	FVector GetTipLocation() const;

	// Server-only simulation state
	apex::sim::FishFight Fight;
	apex::sim::FightConfig FightConfig;
	apex::sim::SeededRng Rng;
	apex::sim::Vec3 LurePos;
	apex::sim::Vec3 LureVel;
	double StateTimer = 0.0;
	float ReelInput = 0.f;
	float DragPercent = 65.f;

	UPROPERTY(Transient)
	TObjectPtr<AApexFish> FishActor;

	// Local visual state (every machine that renders)
	apex::sim::RopeSolver Rope;
	FVector SmoothedHook = FVector::ZeroVector;
	ERodState LastVisualState = ERodState::Idle;
};
