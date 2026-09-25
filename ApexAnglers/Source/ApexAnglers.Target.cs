using UnrealBuildTool;

public class ApexAnglersTarget : TargetRules
{
	public ApexAnglersTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("ApexAnglers");
	}
}
