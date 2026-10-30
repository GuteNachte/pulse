; Lifecycle experiment only: no services, credentials or uninstall registration.
[Setup]
AppId=PulseRollbackLifecycleIsolated
AppName=Pulse Rollback Lifecycle Isolated
AppVersion=1.0.0
DefaultDirName={code:TestDirectory}
DisableDirPage=yes
DisableProgramGroupPage=yes
Uninstallable=no
CreateUninstallRegKey=no
PrivilegesRequired=lowest
CloseApplications=no
RestartApplications=no
OutputDir=..\..\build\installer-recovery-check
OutputBaseFilename=Pulse-Rollback-Lifecycle-Test

[Files]
Source: "fixtures\lifecycle-new.txt"; DestDir: "{app}"; DestName: "first.txt"; Flags: ignoreversion; AfterInstall: FailAfterFirst
Source: "fixtures\lifecycle-new.txt"; DestDir: "{app}"; DestName: "second.txt"; Flags: ignoreversion

[Code]
function CreateFile(Name: String; Access, Share: LongWord; Security: LongWord; Creation, Flags, Template: LongWord): LongWord;
  external 'CreateFileW@kernel32.dll stdcall';
function CloseHandle(Handle: LongWord): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

var
  Root: String;
  FailureInjected: Boolean;
  LockedFile: LongWord;

function TestDirectory(Param: String): String;
begin
  Result := Root;
end;

function InitializeSetup(): Boolean;
begin
  { A fresh directory under this test executable's output directory only. }
  Root := ExpandConstant('{srcexe}');
  Root := ExtractFilePath(Root) + 'lifecycle-' + GetDateTimeString('yyyymmdd-hhnnss', '-', ':');
  Result := not DirExists(Root);
  if not Result then Log('LIFECYCLE_REFUSED_EXISTING_DIRECTORY');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := 'Cannot prepare isolated lifecycle fixtures';
  if CompareText(ExpandConstant('{app}'), Root) <> 0 then exit;
  if DirExists(Root) then exit;
  if not ForceDirectories(Root) then exit;
  if not SaveStringToFile(Root + '\first.txt', 'pulse-lifecycle-old', False) then exit;
  if not SaveStringToFile(Root + '\second.txt', 'pulse-lifecycle-old', False) then exit;
  Log('LIFECYCLE_ROOT=' + Root);
  Log('LIFECYCLE_OLD_HASH=' + GetSHA256OfFile(Root + '\first.txt'));
  Result := '';
end;

procedure FailAfterFirst;
begin
  Log('LIFECYCLE_AFTER_FIRST_HASH=' + GetSHA256OfFile(Root + '\first.txt'));
  { Lock only the fixture created by this run, never a real program. }
  LockedFile := CreateFile(Root + '\second.txt', $80000000, 0, 0, 3, $80, 0);
  FailureInjected := (LockedFile <> 0) and (LockedFile <> $FFFFFFFF);
  if FailureInjected then
    Log('LIFECYCLE_SECOND_FIXTURE_LOCKED')
  else
    Log('LIFECYCLE_INJECTION_FAILED');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  Log(Format('LIFECYCLE_STEP=%d', [Ord(CurStep)]));
end;

procedure DeinitializeSetup;
begin
  if FailureInjected then begin
    if not CloseHandle(LockedFile) then
      Log('LIFECYCLE_LOCK_RELEASE_FAILED')
    else
      Log('LIFECYCLE_LOCK_RELEASED');
  end;
  if not FailureInjected then begin
    Log('LIFECYCLE_INCOMPLETE_NO_INJECTED_FAILURE');
    exit;
  end;
  Log('LIFECYCLE_DEINITIALIZE');
  if FileExists(Root + '\first.txt') then
    Log('LIFECYCLE_EXIT_FIRST_HASH=' + GetSHA256OfFile(Root + '\first.txt'))
  else Log('LIFECYCLE_EXIT_FIRST_MISSING');
  if FileExists(Root + '\second.txt') then
    Log('LIFECYCLE_EXIT_SECOND_HASH=' + GetSHA256OfFile(Root + '\second.txt'))
  else Log('LIFECYCLE_EXIT_SECOND_MISSING');
end;
