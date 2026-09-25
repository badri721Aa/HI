using UnrealBuildTool;

// Dedicated server (public matchmaking + leaderboards, GDD §41).
// Note: building a Server target requires a source build of Unreal Engine (from GitHub), not the Launcher build.
public class ApexAnglersServerTarget : TargetRules
{
	public ApexAnglersServerTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Server;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("ApexAnglers");
	}
}
