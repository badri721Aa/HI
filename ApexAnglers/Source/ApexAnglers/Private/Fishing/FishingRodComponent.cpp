#include "Fishing/FishingRodComponent.h"
#include "Fishing/ApexFish.h"
#include "Player/AnglerCharacter.h"
#include "Boats/ApexBoat.h"
#include "World/ApexOceanSubsystem.h"
#include "Sim/ApexUnreal.h"
#include "ApexAnglers.h"
#include "DrawDebugHelpers.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "HAL/PlatformTime.h"
#include "Net/UnrealNetwork.h"

namespace
{
	enum class EClientResult : uint8 { Landed, Snapped, Spooled, MissedBite };

	apex::sim::Vec3 ToSimDir(const FVector& V) { return { V.X, V.Y, V.Z }; }

	/** M0 species table: a few archetypes so fights feel different. Real data lives in a DataAsset in M1. */
	apex::sim::FishSpecies RollSpecies(apex::sim::SeededRng& Rng, const TCHAR*& OutName)
	{
		apex::sim::FishSpecies S;
		const double R = Rng.NextDouble();
		if (R < 0.55) { OutName = TEXT("Glowshelf Bass"); S.Mass = 8.0; S.MaxForce = 260.0; S.Energy = 3500.0; }
		else if (R < 0.85) { OutName = TEXT("Scrapwater Rustgar"); S.Mass = 22.0; S.MaxForce = 520.0; S.Energy = 7000.0; }
		else if (R < 0.97) { OutName = TEXT("Stormglass Skymako"); S.Mass = 45.0; S.MaxForce = 800.0; S.Energy = 12000.0; S.BreachSpeed = 11.0; }
		else { OutName = TEXT("Hadal Leviathan Fry"); S.Mass = 400.0; S.MaxForce = 6000.0; S.Energy = 60000.0; S.CdA = 0.3; }
		return S;
	}
}

UFishingRodComponent::UFishingRodComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PostPhysics; // after the boat has moved this frame
	SetIsReplicatedByDefault(true);
	Rope.Params.Segments = 24;
}

void UFishingRodComponent::BeginPlay()
{
	Super::BeginPlay();
	if (GetOwner()->HasAuthority())
	{
		// M0: per-session entropy. M1: derive from the Voyage seed so results are auditable (GDD §41).
		Rng = apex::sim::SeededRng(FPlatformTime::Cycles64() ^ (static_cast<uint64>(GetUniqueID()) << 32));
	}
}

void UFishingRodComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (FishActor) FishActor->Destroy();
	Super::EndPlay(EndPlayReason);
}

void UFishingRodComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UFishingRodComponent, Net);
}

FVector UFishingRodComponent::GetTipLocation() const
{
	if (const AAnglerCharacter* Angler = Cast<AAnglerCharacter>(GetOwner())) return Angler->GetRodTipLocation();
	return GetOwner()->GetActorLocation();
}

// ============================================================ local API -> server RPCs

void UFishingRodComponent::RequestCast(const FVector& AimDirection, float Power01)
{
	ServerCast(AimDirection.GetSafeNormal(), FMath::Clamp(Power01, 0.f, 1.f));
}

void UFishingRodComponent::SetReelInput(float Input01)
{
	ServerSetReel(FMath::Clamp(Input01, 0.f, 1.f));
}

void UFishingRodComponent::AdjustDrag(float DeltaPercent)
{
	DragPercent = FMath::Clamp(DragPercent + DeltaPercent, 10.f, 120.f);
	ServerSetDrag(DragPercent);
}

// Validation: a client sending garbage (NaN, out-of-range) is disconnected by the engine (GDD §41).
bool UFishingRodComponent::ServerCast_Validate(FVector_NetQuantizeNormal AimDirection, float Power01)
{
	return !AimDirection.ContainsNaN() && FMath::IsFinite(Power01) && Power01 >= 0.f && Power01 <= 1.f;
}
bool UFishingRodComponent::ServerSetReel_Validate(float Input01) { return FMath::IsFinite(Input01) && Input01 >= 0.f && Input01 <= 1.f; }
bool UFishingRodComponent::ServerSetDrag_Validate(float InDragPercent) { return FMath::IsFinite(InDragPercent) && InDragPercent >= 0.f && InDragPercent <= 150.f; }

void UFishingRodComponent::ServerCast_Implementation(FVector_NetQuantizeNormal AimDirection, float Power01)
{
	if (Net.State != ERodState::Idle) return; // intent ignored, not trusted
	LurePos = apex::ToSim(GetTipLocation());
	LureVel = ToSimDir(AimDirection) * (MaxCastSpeed * FMath::Max(0.2f, Power01));
	StateTimer = 0.0;
	Net.State = ERodState::Casting;
}

void UFishingRodComponent::ServerSetReel_Implementation(float Input01)
{
	ReelInput = Input01;
}

void UFishingRodComponent::ServerSetDrag_Implementation(float InDragPercent)
{
	DragPercent = FMath::Clamp(InDragPercent, 10.f, 120.f);
	if (Net.State == ERodState::Fighting) Fight.SetDrag(DragPercent / 100.0 * FightConfig.Reel.BreakStrength);
}

// ============================================================ tick

void UFishingRodComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (GetOwner()->HasAuthority()) TickServer(DeltaTime);
	if (GetNetMode() != NM_DedicatedServer) TickVisuals(DeltaTime);
}

void UFishingRodComponent::TickServer(float Dt)
{
	const UApexOceanSubsystem* Ocean = GetWorld()->GetSubsystem<UApexOceanSubsystem>();
	if (!Ocean) return;
	const apex::sim::WaveField& Waves = Ocean->GetWaveField();
	const double Time = Ocean->GetOceanTime();
	const apex::sim::Vec3 Tip = apex::ToSim(GetTipLocation());

	switch (Net.State)
	{
	case ERodState::Casting:
	{
		StateTimer += Dt;
		LureVel.Z -= apex::sim::kGravity * Dt;
		LureVel += apex::sim::QuadraticDrag(LureVel, apex::sim::kAirDensity, 0.0008) * (Dt / 0.05); // 50 g lure
		LurePos += LureVel * Dt;
		const double Water = Waves.HeightAt(LurePos.X, LurePos.Y, Time);
		if (LurePos.Z <= Water || StateTimer > 6.0)
		{
			LurePos.Z = Water;
			StateTimer = Rng.Exponential(MeanBiteSeconds) + 1.0;
			Net.State = ERodState::Waiting;
		}
		break;
	}
	case ERodState::Waiting:
		LurePos.Z = Waves.HeightAt(LurePos.X, LurePos.Y, Time);
		StateTimer -= Dt;
		if (ReelInput > 0.5f || (LurePos - Tip).Length() > FightConfig.Reel.MaxLine)
		{
			Net.State = ERodState::Idle; // reeled in early
		}
		else if (StateTimer <= 0.0)
		{
			StateTimer = BiteWindowSeconds;
			Net.State = ERodState::Bite;
		}
		break;

	case ERodState::Bite:
		LurePos.Z = Waves.HeightAt(LurePos.X, LurePos.Y, Time) - 0.25; // bobber dips
		if (ReelInput > 0.5f) StartFight();
		else if ((StateTimer -= Dt) <= 0.0)
		{
			ClientFightResult(static_cast<uint8>(EClientResult::MissedBite), 0.f, 0.f);
			StateTimer = Rng.Exponential(MeanBiteSeconds) + 1.0;
			Net.State = ERodState::Waiting;
		}
		break;

	case ERodState::Fighting:
	{
		const apex::sim::EFightResult Result = Fight.Step(Dt, Tip, ReelInput, Waves, Time);
		const apex::sim::FishState& Fish = Fight.Fish.State;
		if (FishActor) FishActor->UpdateFromSim(apex::ToUnreal(Fish.Position), apex::ToUnreal(Fish.Velocity));

		// Newton's third law: the line pulls whatever holds the rod. On a boat, the whole hull gets
		// dragged (GDD §10 "Chonky Leviathan Drag"); on foot, the angler gets tugged.
		const apex::sim::Vec3 Pull = Fight.AnchorForce(Tip);
		if (AAnglerCharacter* Angler = Cast<AAnglerCharacter>(GetOwner()))
		{
			if (AApexBoat* Boat = Angler->GetBoatUnderFeet())
			{
				Boat->AddExternalForceAtLocation(FVector(Pull.X, Pull.Y, Pull.Z), GetTipLocation());
			}
			else if (UCharacterMovementComponent* Move = Angler->GetCharacterMovement())
			{
				Move->AddForce(apex::ForceToUnreal(Pull) * OnFootPullScale);
			}
		}
		if (Result != apex::sim::EFightResult::Ongoing) EndFight(Result);
		break;
	}
	case ERodState::Cooldown:
		if ((StateTimer -= Dt) <= 0.0) Net.State = ERodState::Idle;
		break;

	case ERodState::Idle:
	default:
		break;
	}

	PublishNetState();
}

void UFishingRodComponent::StartFight()
{
	const TCHAR* SpeciesName = TEXT("?");
	FightConfig.Species = RollSpecies(Rng, SpeciesName);
	FightConfig.DragSetting = DragPercent / 100.0 * FightConfig.Reel.BreakStrength;
	const apex::sim::Vec3 Tip = apex::ToSim(GetTipLocation());
	const apex::sim::Vec3 HookPos = LurePos - apex::sim::Vec3(0, 0, 1.0);
	Fight.Begin(FightConfig, Tip, HookPos, Rng.NextU64());

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	FishActor = GetWorld()->SpawnActor<AApexFish>(AApexFish::StaticClass(), FTransform(apex::ToUnreal(HookPos)), Params);
	if (FishActor)
	{
		const float Scale = FMath::Clamp(FMath::Pow(static_cast<float>(FightConfig.Species.Mass) / 10.f, 1.f / 3.f), 0.6f, 4.f);
		FishActor->SetActorScale3D(FVector(Scale));
	}
	UE_LOG(LogApex, Log, TEXT("%s hooked a %s"), *GetOwner()->GetName(), SpeciesName);
	Net.State = ERodState::Fighting;
}

void UFishingRodComponent::EndFight(apex::sim::EFightResult Result)
{
	using apex::sim::EFightResult;
	const float Seconds = static_cast<float>(Fight.GetElapsed());
	float WeightKg = 0.f;
	EClientResult ClientResult = EClientResult::Snapped;

	if (Result == EFightResult::Landed)
	{
		WeightKg = static_cast<float>(FightConfig.Species.Mass * Rng.Range(0.75, 1.3)); // server-rolled, never client-reported
		ClientResult = EClientResult::Landed;
	}
	else
	{
		ClientResult = Result == EFightResult::Spooled ? EClientResult::Spooled : EClientResult::Snapped;
		// Snap whip-back: stored line energy knocks the angler back (GDD §6).
		if (ACharacter* Angler = Cast<ACharacter>(GetOwner()))
		{
			const FVector Away = (GetOwner()->GetActorLocation() - apex::ToUnreal(Fight.Fish.State.Position)).GetSafeNormal2D();
			const double Kick = FMath::Clamp(Fight.Reel.SnapEnergy() * 40.0, 150.0, 900.0);
			Angler->LaunchCharacter(Away * Kick + FVector(0, 0, Kick * 0.5), false, false);
		}
	}

	if (FishActor) { FishActor->Destroy(); FishActor = nullptr; }
	ClientFightResult(static_cast<uint8>(ClientResult), WeightKg, Seconds);
	StateTimer = CooldownSeconds;
	Net.State = ERodState::Cooldown;
}

void UFishingRodComponent::PublishNetState()
{
	const apex::sim::Vec3 Tip = apex::ToSim(GetTipLocation());
	if (Net.State == ERodState::Fighting)
	{
		const apex::sim::ReelModel& Reel = Fight.Reel;
		Net.HookLocation = apex::ToUnreal(Fight.Fish.State.Position);
		Net.LineOutCm = static_cast<float>(Reel.State.LineOut * 100.0);
		Net.Tension = static_cast<uint8>(FMath::Clamp(Reel.TensionRatio() / 1.25 * 255.0, 0.0, 255.0));
		Net.Heat = static_cast<uint8>(FMath::Clamp(Reel.State.Heat / Reel.Params.HeatMax * 255.0, 0.0, 255.0));
		Net.FishStamina = static_cast<uint8>(FMath::Clamp(Fight.Fish.State.Stamina * 255.0, 0.0, 255.0));
	}
	else
	{
		Net.HookLocation = apex::ToUnreal(LurePos);
		Net.LineOutCm = static_cast<float>((LurePos - Tip).Length() * 100.0);
		Net.Tension = 0;
		Net.FishStamina = 0;
	}
	Net.DragPercent = static_cast<uint8>(FMath::Clamp(DragPercent, 0.f, 255.f));
}

// ============================================================ visuals (every rendering machine)

void UFishingRodComponent::TickVisuals(float Dt)
{
	const ERodState State = Net.State;
	const FVector Tip = GetTipLocation();
	if (State == ERodState::Idle || State == ERodState::Cooldown)
	{
		LastVisualState = State;
		return;
	}

	// Server positions arrive at net rate; smooth them for rendering.
	if (LastVisualState == ERodState::Idle || LastVisualState == ERodState::Cooldown) SmoothedHook = Net.HookLocation;
	SmoothedHook = FMath::VInterpTo(SmoothedHook, FVector(Net.HookLocation), Dt, 18.f);

	const double ChordM = FVector::Dist(Tip, SmoothedHook) * 0.01;
	const double RestM = State == ERodState::Fighting ? FMath::Max(0.5, Net.LineOutCm * 0.01) : ChordM * 1.04;
	if (LastVisualState == ERodState::Idle || LastVisualState == ERodState::Cooldown || Rope.GetPoints().empty())
	{
		Rope.Reset(apex::ToSim(Tip), apex::ToSim(SmoothedHook), RestM);
	}
	LastVisualState = State;

	const UApexOceanSubsystem* Ocean = GetWorld()->GetSubsystem<UApexOceanSubsystem>();
	Rope.SetRestLength(RestM);
	Rope.SetEndpoints(apex::ToSim(Tip), apex::ToSim(SmoothedHook));
	Rope.Step(FMath::Min(Dt, 1.f / 30.f), Ocean ? &Ocean->GetWaveField() : nullptr, Ocean ? Ocean->GetOceanTime() : 0.0);

#if ENABLE_DRAW_DEBUG
	// M0 line rendering. M1: spline mesh / Niagara ribbon driven by the same points.
	const float Tension = GetTensionRatio();
	const FColor LineColor = FLinearColor::LerpUsingHSV(FLinearColor::White, FLinearColor::Red, FMath::Clamp(Tension, 0.f, 1.f)).ToFColor(true);
	const auto& Points = Rope.GetPoints();
	for (size_t I = 1; I < Points.size(); ++I)
	{
		DrawDebugLine(GetWorld(), apex::ToUnreal(Points[I - 1]), apex::ToUnreal(Points[I]), LineColor, false, 0.f, SDPG_World, 1.5f);
	}
	if (State == ERodState::Waiting || State == ERodState::Bite || State == ERodState::Casting)
	{
		const bool bFlash = State == ERodState::Bite && FMath::Fmod(GetWorld()->GetTimeSeconds(), 0.2) < 0.1;
		DrawDebugSphere(GetWorld(), SmoothedHook, 8.f, 8, bFlash ? FColor::Yellow : FColor::Red, false, 0.f, SDPG_World, 2.f);
	}

	// Owning player's M0 HUD (replaced by a Common UI widget in M1).
	const APawn* Pawn = Cast<APawn>(GetOwner());
	if (GEngine && Pawn && Pawn->IsLocallyControlled())
	{
		const uint64 Key = 0xA9E0000ull + GetUniqueID();
		FString Text;
		switch (State)
		{
		case ERodState::Casting: Text = TEXT("Casting..."); break;
		case ERodState::Waiting: Text = TEXT("Waiting for a bite... (RMB to reel in)"); break;
		case ERodState::Bite: Text = TEXT(">>> BITE! Hold RMB to set the hook! <<<"); break;
		case ERodState::Fighting:
			Text = FString::Printf(TEXT("TENSION %3.0f%%  |  line %.1f m  |  fish stamina %3.0f%%  |  heat %3.0f%%  |  drag %d%% (mouse wheel)"),
				Tension * 100.f, Net.LineOutCm * 0.01f, Net.FishStamina / 2.55f, Net.Heat / 2.55f, Net.DragPercent);
			break;
		default: break;
		}
		GEngine->AddOnScreenDebugMessage(Key, 0.f, State == ERodState::Bite ? FColor::Yellow : (Tension > 0.8f ? FColor::Red : FColor::Cyan), Text);
	}
#endif
}

void UFishingRodComponent::ClientFightResult_Implementation(uint8 Result, float WeightKg, float Seconds)
{
	if (!GEngine) return;
	FString Text;
	FColor Color = FColor::White;
	switch (static_cast<EClientResult>(Result))
	{
	case EClientResult::Landed: Text = FString::Printf(TEXT("LANDED! %.1f kg after %.1f s"), WeightKg, Seconds); Color = FColor::Green; break;
	case EClientResult::Snapped: Text = FString::Printf(TEXT("SNAP! The line broke after %.1f s. Ease off when tension goes red."), Seconds); Color = FColor::Red; break;
	case EClientResult::Spooled: Text = TEXT("SPOOLED! It ran out all your line. Tighten the drag."); Color = FColor::Orange; break;
	case EClientResult::MissedBite: Text = TEXT("Too slow, it stole the bait."); Color = FColor::Silver; break;
	}
	GEngine->AddOnScreenDebugMessage(-1, 4.f, Color, Text);
}
