using UnrealBuildTool;

public class ApexAnglersEditorTarget : TargetRules
{
	public ApexAnglersEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("ApexAnglers");
	}
}
