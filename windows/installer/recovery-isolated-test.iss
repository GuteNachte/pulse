; Isolated harness: no service APIs, files, registry or installation actions.
[Setup]
AppName=Pulse Recovery Isolated Test
AppVersion=1.0.0
CreateAppDir=no
Uninstallable=no
PrivilegesRequired=lowest
OutputDir=..\..\build\installer-recovery-check
OutputBaseFilename=Pulse-Recovery-Isolated-Test

[Code]
type
  TPulseServiceStatus = record
    ServiceType, CurrentState, ControlsAccepted: LongWord;
    Win32ExitCode, ServiceSpecificExitCode, CheckPoint, WaitHint: LongWord;
  end;
var
  Scenario, Queries, ClosedManager, ClosedService: Integer;

function OpenSCManager(MachineName, DatabaseName: String; Access: LongWord): LongWord;
begin
  Result := 101;
  if Scenario = 1 then Result := 0;
end;

function OpenService(Manager: LongWord; Name: String; Access: LongWord): LongWord;
begin
  Result := 102;
  if Scenario = 2 then Result := 0;
end;

function QueryServiceStatus(Service: LongWord; var Status: TPulseServiceStatus): Boolean;
begin
  Queries := Queries + 1;
  Result := Scenario <> 3;
  Status.CurrentState := 2;
  Status.Win32ExitCode := 0;
  Status.ServiceSpecificExitCode := 0;
  if (Scenario = 5) or ((Scenario = 6) and (Queries >= 3)) then
    Status.CurrentState := 4;
end;

function CloseServiceHandle(Handle: LongWord): Boolean;
begin
  if Handle = 101 then ClosedManager := ClosedManager + 1;
  if Handle = 102 then ClosedService := ClosedService + 1;
  Result := True;
end;

#include "service-recovery.iss"

procedure CheckCase(Id, ExpectedQueries, ExpectedManager, ExpectedService: Integer; ExpectedError: String);
var
  Actual: String;
begin
  Scenario := Id;
  Queries := 0;
  ClosedManager := 0;
  ClosedService := 0;
  Actual := WaitForPulseServiceRunning;
  if (Actual <> ExpectedError) or (Queries <> ExpectedQueries) or
     (ClosedManager <> ExpectedManager) or (ClosedService <> ExpectedService) then
    RaiseException(Format('Isolated recovery case %d failed', [Id]));
  Log(Format('ISOLATED_RECOVERY_CASE_PASS=%d', [Id]));
end;

function InitializeSetup(): Boolean;
begin
  Result := False;
  CheckCase(1, 0, 0, 0, '无法确认原采集服务是否恢复：无法访问服务管理器。');
  CheckCase(2, 0, 1, 0, '无法确认原采集服务是否恢复：无法读取服务。');
  CheckCase(3, 1, 1, 1, '无法确认原采集服务是否恢复：状态查询失败。');
  CheckCase(4, 61, 1, 1, '原采集服务未在 30 秒内恢复运行。');
  CheckCase(5, 1, 1, 1, '');
  CheckCase(6, 3, 1, 1, '');
  Log('ISOLATED_RECOVERY_ALL_PASS=6');
  { Always exit before entering installation, including on success. }
end;
