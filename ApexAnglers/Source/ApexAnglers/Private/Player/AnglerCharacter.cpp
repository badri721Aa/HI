#include "Player/AnglerCharacter.h"
#include "Boats/ApexBoat.h"
#include "Fishing/FishingRodComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "EngineUtils.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"

AAnglerCharacter::AAnglerCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(40.f, 90.f);
	bUseControllerRotationYaw = true; // aim where you look
	GetCharacterMovement()->bOrientRotationToMovement = false;
	GetCharacterMovement()->JumpZVelocity = 520.f;
	GetCharacterMovement()->AirControl = 0.3f;
	GetCharacterMovement()->MaxWalkSpeed = 420.f;

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = 420.f;
	CameraBoom->SocketOffset = FVector(0.f, 70.f, 60.f); // over-the-shoulder
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bEnableCameraLag = true;
	CameraBoom->CameraLagSpeed = 12.f;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

	// Placeholder body until the character art pass (GDD §4).
	BodyMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BodyMesh"));
	BodyMesh->SetupAttachment(RootComponent);
	if (Cylinder.Succeeded()) BodyMesh->SetStaticMesh(Cylinder.Object);
	BodyMesh->SetRelativeScale3D(FVector(0.7f, 0.7f, 1.8f));
	BodyMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	RodMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("RodMesh"));
	RodMesh->SetupAttachment(RootComponent);
	if (Cylinder.Succeeded()) RodMesh->SetStaticMesh(Cylinder.Object);
	RodMesh->SetRelativeLocation(FVector(45.f, 30.f, 20.f));
	RodMesh->SetRelativeRotation(FRotator(-40.f, 0.f, 0.f)); // tilt the rod forward/up
	RodMesh->SetRelativeScale3D(FVector(0.04f, 0.04f, 2.4f));  // 2.4 m blank
	RodMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Rod = CreateDefaultSubobject<UFishingRodComponent>(TEXT("FishingRod"));
}

void AAnglerCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AAnglerCharacter, bAtHelm);
}

FVector AAnglerCharacter::GetRodTipLocation() const
{
	// Engine cylinder is 100 cm tall and centered, so the tip sits half its scaled length up the local Z axis.
	return RodMesh->GetComponentLocation() + RodMesh->GetUpVector() * (50.0 * RodMesh->GetRelativeScale3D().Z);
}

AApexBoat* AAnglerCharacter::GetBoatUnderFeet() const
{
	const UPrimitiveComponent* Base = GetMovementBase();
	return Base ? Cast<AApexBoat>(Base->GetOwner()) : nullptr;
}

AApexBoat* AAnglerCharacter::FindNearestBoat(float MaxDistance) const
{
	AApexBoat* Best = nullptr;
	double BestDistSq = FMath::Square(static_cast<double>(MaxDistance));
	for (TActorIterator<AApexBoat> It(GetWorld()); It; ++It)
	{
		const double D = FVector::DistSquared(It->GetHelmLocation(), GetActorLocation());
		if (D < BestDistSq) { BestDistSq = D; Best = *It; }
	}
	return Best;
}

void AAnglerCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Server: drop the helm if we wandered off (or got knocked overboard).
	if (HasAuthority() && bAtHelm && (!HelmBoat || FVector::Dist(HelmBoat->GetHelmLocation(), GetActorLocation()) > HelmReach * 1.5f))
	{
		if (HelmBoat) HelmBoat->SetControls(0.f, 0.f);
		bAtHelm = false;
		HelmBoat = nullptr;
	}
}

// ============================================================ input (built in code, no assets needed)

void AAnglerCharacter::BuildInputAssets()
{
	if (MappingContext) return;

	auto MakeAction = [this](const TCHAR* Name, EInputActionValueType Type)
	{
		UInputAction* Action = NewObject<UInputAction>(this, Name);
		Action->ValueType = Type;
		return Action;
	};
	MoveAction = MakeAction(TEXT("IA_Move"), EInputActionValueType::Axis2D);
	LookAction = MakeAction(TEXT("IA_Look"), EInputActionValueType::Axis2D);
	JumpAction = MakeAction(TEXT("IA_Jump"), EInputActionValueType::Boolean);
	CastAction = MakeAction(TEXT("IA_Cast"), EInputActionValueType::Boolean);
	ReelAction = MakeAction(TEXT("IA_Reel"), EInputActionValueType::Boolean);
	DragAction = MakeAction(TEXT("IA_Drag"), EInputActionValueType::Axis1D);
	HelmAction = MakeAction(TEXT("IA_Helm"), EInputActionValueType::Boolean);

	MappingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_Angler"));

	// WASD -> 2D axis: W = +Y, S = -Y, D = +X, A = -X
	auto Swizzle = [this]() { return NewObject<UInputModifierSwizzleAxis>(this); };
	auto Negate = [this]() { return NewObject<UInputModifierNegate>(this); };
	MappingContext->MapKey(MoveAction, EKeys::W).Modifiers.Add(Swizzle());
	{
		FEnhancedActionKeyMapping& S = MappingContext->MapKey(MoveAction, EKeys::S);
		S.Modifiers.Add(Swizzle());
		S.Modifiers.Add(Negate());
	}
	MappingContext->MapKey(MoveAction, EKeys::D);
	MappingContext->MapKey(MoveAction, EKeys::A).Modifiers.Add(Negate());

	// Mouse look with Y inverted to "mouse up = look up"
	{
		UInputModifierNegate* InvertY = Negate();
		InvertY->bX = false;
		InvertY->bY = true;
		InvertY->bZ = false;
		MappingContext->MapKey(LookAction, EKeys::Mouse2D).Modifiers.Add(InvertY);
	}
	MappingContext->MapKey(JumpAction, EKeys::SpaceBar);
	MappingContext->MapKey(CastAction, EKeys::LeftMouseButton);
	MappingContext->MapKey(ReelAction, EKeys::RightMouseButton);
	MappingContext->MapKey(DragAction, EKeys::MouseWheelAxis);
	MappingContext->MapKey(HelmAction, EKeys::E);

	// Gamepad
	MappingContext->MapKey(MoveAction, EKeys::Gamepad_Left2D);
	MappingContext->MapKey(LookAction, EKeys::Gamepad_Right2D);
	MappingContext->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	MappingContext->MapKey(CastAction, EKeys::Gamepad_LeftTrigger);
	MappingContext->MapKey(ReelAction, EKeys::Gamepad_RightTrigger);
	MappingContext->MapKey(HelmAction, EKeys::Gamepad_FaceButton_Left);
}

void AAnglerCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	BuildInputAssets();

	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			Subsystem->AddMappingContext(MappingContext, 0);
		}
	}

	UEnhancedInputComponent* Input = CastChecked<UEnhancedInputComponent>(PlayerInputComponent);
	Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AAnglerCharacter::OnMove);
	Input->BindAction(MoveAction, ETriggerEvent::Completed, this, &AAnglerCharacter::OnMoveStopped);
	Input->BindAction(LookAction, ETriggerEvent::Triggered, this, &AAnglerCharacter::OnLook);
	Input->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
	Input->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
	Input->BindAction(CastAction, ETriggerEvent::Started, this, &AAnglerCharacter::OnCastStarted);
	Input->BindAction(CastAction, ETriggerEvent::Completed, this, &AAnglerCharacter::OnCastReleased);
	Input->BindAction(ReelAction, ETriggerEvent::Started, this, &AAnglerCharacter::OnReelStarted);
	Input->BindAction(ReelAction, ETriggerEvent::Completed, this, &AAnglerCharacter::OnReelStopped);
	Input->BindAction(DragAction, ETriggerEvent::Triggered, this, &AAnglerCharacter::OnDrag);
	Input->BindAction(HelmAction, ETriggerEvent::Started, this, &AAnglerCharacter::OnHelm);
}

void AAnglerCharacter::OnMove(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	if (bAtHelm)
	{
		ServerSetBoatControls(static_cast<float>(Axis.Y), static_cast<float>(Axis.X));
		return;
	}
	const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), static_cast<float>(Axis.Y));
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), static_cast<float>(Axis.X));
}

void AAnglerCharacter::OnMoveStopped(const FInputActionValue& Value)
{
	if (bAtHelm) ServerSetBoatControls(0.f, 0.f);
}

void AAnglerCharacter::OnLook(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(static_cast<float>(Axis.X));
	AddControllerPitchInput(static_cast<float>(Axis.Y));
}

void AAnglerCharacter::OnCastStarted(const FInputActionValue& Value)
{
	CastChargeStart = GetWorld()->GetTimeSeconds();
}

void AAnglerCharacter::OnCastReleased(const FInputActionValue& Value)
{
	if (CastChargeStart < 0.0) return;
	// M0: hold 0-1.2 s for power. The rhythm-based "Perfect Cast" (GDD §9) replaces this in M1.
	const float Power = FMath::Clamp(static_cast<float>((GetWorld()->GetTimeSeconds() - CastChargeStart) / 1.2), 0.f, 1.f);
	CastChargeStart = -1.0;
	const FVector Aim = (GetControlRotation() + FRotator(15.f, 0.f, 0.f)).Vector(); // loft the cast a little
	Rod->RequestCast(Aim, Power);
}

void AAnglerCharacter::OnReelStarted(const FInputActionValue& Value) { Rod->SetReelInput(1.f); }
void AAnglerCharacter::OnReelStopped(const FInputActionValue& Value) { Rod->SetReelInput(0.f); }
void AAnglerCharacter::OnDrag(const FInputActionValue& Value) { Rod->AdjustDrag(Value.Get<float>() * 5.f); }

void AAnglerCharacter::OnHelm(const FInputActionValue& Value)
{
	ServerSetHelm(!bAtHelm);
}

// ============================================================ server RPCs (validated, GDD §41)

bool AAnglerCharacter::ServerSetHelm_Validate(bool bWantsHelm) { return true; }

void AAnglerCharacter::ServerSetHelm_Implementation(bool bWantsHelm)
{
	if (!bWantsHelm)
	{
		if (HelmBoat) HelmBoat->SetControls(0.f, 0.f);
		bAtHelm = false;
		HelmBoat = nullptr;
		return;
	}
	// Server decides whether you're actually close enough to steer.
	if (AApexBoat* Boat = FindNearestBoat(HelmReach))
	{
		HelmBoat = Boat;
		bAtHelm = true;
	}
}

bool AAnglerCharacter::ServerSetBoatControls_Validate(float Throttle, float Rudder)
{
	return FMath::IsFinite(Throttle) && FMath::IsFinite(Rudder) && FMath::Abs(Throttle) <= 1.f && FMath::Abs(Rudder) <= 1.f;
}

void AAnglerCharacter::ServerSetBoatControls_Implementation(float Throttle, float Rudder)
{
	if (bAtHelm && HelmBoat) HelmBoat->SetControls(Throttle, Rudder);
}
