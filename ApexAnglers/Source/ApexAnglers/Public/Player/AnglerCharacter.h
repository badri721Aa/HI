#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "AnglerCharacter.generated.h"

class AApexBoat;
class UCameraComponent;
class UFishingRodComponent;
class UInputAction;
class UInputMappingContext;
class USpringArmComponent;
class UStaticMeshComponent;
struct FInputActionValue;

/**
 * The Angler (M0). Controls are created in code so the prototype needs no editor assets:
 *   WASD move (or steer at the helm) · Mouse look · Space jump · E take/leave helm
 *   Hold+release LMB cast (hold longer = further) · Hold RMB set hook / reel · Mouse wheel drag
 */
UCLASS()
class APEXANGLERS_API AAnglerCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AAnglerCharacter();

	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void Tick(float DeltaSeconds) override;

	FVector GetRodTipLocation() const;
	AApexBoat* GetBoatUnderFeet() const;
	UFishingRodComponent* GetRod() const { return Rod; }
	bool IsAtHelm() const { return bAtHelm; }

	/** Max distance (cm) from the helm to steer. Checked on the server. */
	UPROPERTY(EditDefaultsOnly, Category = "Boat")
	float HelmReach = 300.f;

protected:
	UPROPERTY(VisibleAnywhere, Category = "Components")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	TObjectPtr<UCameraComponent> Camera;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	TObjectPtr<UStaticMeshComponent> BodyMesh;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	TObjectPtr<UStaticMeshComponent> RodMesh;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	TObjectPtr<UFishingRodComponent> Rod;

	UPROPERTY(Replicated)
	bool bAtHelm = false;

	UFUNCTION(Server, Reliable, WithValidation)
	void ServerSetHelm(bool bWantsHelm);

	UFUNCTION(Server, Unreliable, WithValidation)
	void ServerSetBoatControls(float Throttle, float Rudder);

private:
	void BuildInputAssets();
	AApexBoat* FindNearestBoat(float MaxDistance) const;

	void OnMove(const FInputActionValue& Value);
	void OnMoveStopped(const FInputActionValue& Value);
	void OnLook(const FInputActionValue& Value);
	void OnCastStarted(const FInputActionValue& Value);
	void OnCastReleased(const FInputActionValue& Value);
	void OnReelStarted(const FInputActionValue& Value);
	void OnReelStopped(const FInputActionValue& Value);
	void OnDrag(const FInputActionValue& Value);
	void OnHelm(const FInputActionValue& Value);

	UPROPERTY(Transient) TObjectPtr<UInputMappingContext> MappingContext;
	UPROPERTY(Transient) TObjectPtr<UInputAction> MoveAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> LookAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> JumpAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> CastAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> ReelAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> DragAction;
	UPROPERTY(Transient) TObjectPtr<UInputAction> HelmAction;

	/** Server: the boat we're steering. */
	UPROPERTY(Transient)
	TObjectPtr<AApexBoat> HelmBoat;

	double CastChargeStart = -1.0;
};
