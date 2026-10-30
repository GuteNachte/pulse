; Pulse Agent Windows installer
#define AppName "Pulse Agent"
#define AppVersion GetEnv("PULSE_AGENT_VERSION")
#define AppPublisher "Gutenacht"
#define AgentExe "..\..\build\releases\windows-installer\pulse-agent.exe"
#define ConfigExe "..\..\build\releases\windows-installer\agent-config.exe"

[Setup]
AppId={{B1EFD9E2-7E3A-4C48-9F5A-3B734D5E9A16}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={code:GetDefaultInstallDir}
DisableProgramGroupPage=no
DefaultGroupName=Pulse Agent
PrivilegesRequired=admin
OutputDir=..\..\build\releases\windows-installer
#ifdef PULSE_TEST_ABORT_PREPARE
OutputBaseFilename=Pulse-Agent-{#AppVersion}-Abort-Recovery-Test
#else
OutputBaseFilename=Pulse-Agent-{#AppVersion}-Setup
#endif
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=Pulse Agent

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Dirs]
Name: "{app}\bin"
Name: "{app}\data\config"
Name: "{app}\data\credentials"
Name: "{app}\data\logs"
Name: "{app}\data\updates"
Name: "{app}\data\rollback"

[Files]
Source: "{#AgentExe}"; DestDir: "{app}\bin"; DestName: "pulse-agent.exe"; Flags: ignoreversion; BeforeInstall: MarkFileReplacementStarted
Source: "{#ConfigExe}"; DestDir: "{app}\bin"; DestName: "agent-config.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\Pulse Agent"; Filename: "{app}\bin\agent-config.exe"; WorkingDir: "{app}\bin"
Name: "{group}\Uninstall Pulse Agent"; Filename: "{uninstallexe}"

[Run]
Filename: "{sys}\sc.exe"; Parameters: "create pulse-agent binPath= ""{app}\bin\pulse-agent.exe"" start= auto DisplayName= ""Pulse Agent"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure pulse-agent reset= 86400 actions= restart/5000/restart/30000/none/0"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start pulse-agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\icacls.exe"; Parameters: """{app}\data\credentials"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\agent-config.exe"; WorkingDir: "{app}\bin"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop pulse-agent"; Flags: runhidden waituntilterminated; RunOnceId: "PulseAgentStop"
Filename: "{sys}\sc.exe"; Parameters: "delete pulse-agent"; Flags: runhidden waituntilterminated; RunOnceId: "PulseAgentDelete"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"; Check: ShouldDeleteUserData
Type: filesandordirs; Name: "{app}\bin"

[Code]
type
  TPulseServiceStatus = record
    ServiceType, CurrentState, ControlsAccepted: LongWord;
    Win32ExitCode, ServiceSpecificExitCode, CheckPoint, WaitHint: LongWord;
  end;

function OpenSCManager(MachineName, DatabaseName: String; Access: LongWord): LongWord;
  external 'OpenSCManagerW@advapi32.dll stdcall';
function OpenService(Manager: LongWord; Name: String; Access: LongWord): LongWord;
  external 'OpenServiceW@advapi32.dll stdcall';
function QueryServiceStatus(Service: LongWord; var Status: TPulseServiceStatus): Boolean;
  external 'QueryServiceStatus@advapi32.dll stdcall';
function ControlService(Service, Control: LongWord; var Status: TPulseServiceStatus): Boolean;
  external 'ControlService@advapi32.dll stdcall';
function CloseServiceHandle(Handle: LongWord): Boolean;
  external 'CloseServiceHandle@advapi32.dll stdcall';

var
  DeleteUserDataValue: Boolean;
  CDriveWarningShown: Boolean;
  ServiceWasRunning: Boolean;
  FileReplacementStarted: Boolean;
  RollbackPrepared: Boolean;
  InstallSucceeded: Boolean;
  RollbackDir: String;
  AgentExistedBefore: Boolean;
  ConfigExistedBefore: Boolean;

function GetDriveType(Drive: String): Integer;
  external 'GetDriveTypeW@kernel32.dll stdcall';

function StopPulseService: String;
var
  Manager, Service, ErrorCode: LongWord;
  Status: TPulseServiceStatus;
  Attempt: Integer;
begin
  Result := '';
  Manager := OpenSCManager('', '', 1);
  if Manager = 0 then begin
    Result := '无法访问 Windows 服务管理器，安装已停止。';
    exit;
  end;
  try
    Service := OpenService(Manager, 'pulse-agent', $0024);
    if Service = 0 then begin
      ErrorCode := DLLGetLastError;
      if ErrorCode <> 1060 then
        Result := Format('无法读取采集服务（错误 %d），安装已停止。', [ErrorCode]);
      exit;
    end;
    try
      if not QueryServiceStatus(Service, Status) then begin
        Result := '无法确认采集服务状态，安装已停止。';
        exit;
      end;
      if Status.CurrentState = 1 then exit;
      if Status.CurrentState = 4 then ServiceWasRunning := True;
      if Status.CurrentState <> 3 then begin
        if not ControlService(Service, 1, Status) then begin
          ErrorCode := DLLGetLastError;
          if ErrorCode <> 1062 then begin
            Result := Format('无法停止采集服务（错误 %d），安装已停止。', [ErrorCode]);
            exit;
          end;
        end;
      end;
      { Poll the real state; sending a stop request is not completion. }
      for Attempt := 0 to 60 do begin
        if not QueryServiceStatus(Service, Status) then begin
          Result := '无法确认采集服务是否已停止，安装已停止。';
          exit;
        end;
        if Status.CurrentState = 1 then exit;
        if Attempt < 60 then Sleep(500);
      end;
      Result := '采集服务在 30 秒内未停止，安装已中止。请检查服务状态后重试。';
    finally
      CloseServiceHandle(Service);
    end;
  finally
    CloseServiceHandle(Manager);
  end;
end;

function PrepareRollback: String;
var
  AgentPath, ConfigPath: String;
begin
  Result := '';
  AgentPath := ExpandConstant('{app}\bin\pulse-agent.exe');
  ConfigPath := ExpandConstant('{app}\bin\agent-config.exe');
  AgentExistedBefore := FileExists(AgentPath);
  ConfigExistedBefore := FileExists(ConfigPath);
  if (not AgentExistedBefore) and (not ConfigExistedBefore) then exit;
  RollbackDir := ExpandConstant('{app}\data\rollback\installer-' + GetDateTimeString('yyyymmdd-hhnnss', '-', ':'));
  if not ForceDirectories(RollbackDir) then begin
    Result := '无法创建旧版本备份目录，安装已停止。';
    exit;
  end;
  if FileExists(AgentPath) then
    if (not CopyFile(AgentPath, RollbackDir + '\pulse-agent.exe', False)) or
       (GetSHA256OfFile(AgentPath) <> GetSHA256OfFile(RollbackDir + '\pulse-agent.exe')) then begin
      Result := '旧版采集程序备份失败，安装已停止。';
      exit;
    end;
  if FileExists(ConfigPath) then
    if (not CopyFile(ConfigPath, RollbackDir + '\agent-config.exe', False)) or
       (GetSHA256OfFile(ConfigPath) <> GetSHA256OfFile(RollbackDir + '\agent-config.exe')) then begin
      Result := '旧版配置程序备份失败，安装已停止。';
      exit;
    end;
  RollbackPrepared := True;
  Log('Rollback backup prepared: ' + RollbackDir);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := StopPulseService;
  if Result = '' then
    Result := PrepareRollback;
#ifdef PULSE_TEST_ABORT_PREPARE
  { Compiled only into the dedicated recovery acceptance artifact. }
  if Result = '' then begin
    Log('PULSE_TEST_ABORT_PREPARE: preparation stopped before file replacement.');
    Result := '恢复验收专用测试：服务停止后主动中止，未开始替换程序文件。';
  end;
#endif
end;

procedure MarkFileReplacementStarted;
begin
  FileReplacementStarted := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then
    InstallSucceeded := True;
end;

#include "service-recovery.iss"

procedure DeinitializeSetup;
var
  ResultCode: Integer;
  RecoveryError: String;
  AgentPath, ConfigPath: String;
  RestoreError: String;
begin
  RestoreError := '';
  { If replacement started but setup did not finish, restore both old binaries. }
  if RollbackPrepared and FileReplacementStarted and (not InstallSucceeded) then begin
    AgentPath := ExpandConstant('{app}\bin\pulse-agent.exe');
    ConfigPath := ExpandConstant('{app}\bin\agent-config.exe');
    if FileExists(RollbackDir + '\pulse-agent.exe') then begin
      if FileExists(AgentPath) and
         (GetSHA256OfFile(AgentPath) = GetSHA256OfFile(RollbackDir + '\pulse-agent.exe')) then
        Log('Agent binary already matches the rollback backup; restore skipped.')
      else begin
        DeleteFile(AgentPath);
        if (not CopyFile(RollbackDir + '\pulse-agent.exe', AgentPath, False)) or
           (GetSHA256OfFile(RollbackDir + '\pulse-agent.exe') <> GetSHA256OfFile(AgentPath)) then
          RestoreError := '采集程序恢复失败。'
        else
          Log('Agent binary restored from backup.');
      end;
    end else if AgentExistedBefore then
      RestoreError := '采集程序备份缺失。'
    else
      DeleteFile(AgentPath);
    if (RestoreError = '') and FileExists(RollbackDir + '\agent-config.exe') then begin
      if FileExists(ConfigPath) and
         (GetSHA256OfFile(ConfigPath) = GetSHA256OfFile(RollbackDir + '\agent-config.exe')) then
        Log('Config binary already matches the rollback backup; restore skipped.')
      else begin
        DeleteFile(ConfigPath);
        if (not CopyFile(RollbackDir + '\agent-config.exe', ConfigPath, False)) or
           (GetSHA256OfFile(RollbackDir + '\agent-config.exe') <> GetSHA256OfFile(ConfigPath)) then
          RestoreError := '配置程序恢复失败。'
        else
          Log('Config binary restored from backup.');
      end;
    end else if (RestoreError = '') and ConfigExistedBefore then
      RestoreError := '配置程序备份缺失。'
    else if (RestoreError = '') then
      DeleteFile(ConfigPath);
    if RestoreError <> '' then
      MsgBox('安装未完成，' + RestoreError + '已保留旧版本备份，请检查安装日志。', mbError, MB_OK)
    else
      Log('Rollback restore verified: both binaries restored.');
  end;
  { Only recover untouched binaries after preparation was canceled or aborted. }
  if ServiceWasRunning and (RestoreError = '') and
     ((not FileReplacementStarted) or (RollbackPrepared and (not InstallSucceeded))) then begin
    if not Exec(ExpandConstant('{sys}\sc.exe'), 'start pulse-agent', '',
                SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
      Log('Unable to launch service recovery command.');
      MsgBox('安装未完成，且无法恢复原采集服务。请检查 Windows 服务中的 Pulse Agent 状态。', mbError, MB_OK);
    end else if (ResultCode <> 0) and (ResultCode <> 1056) then begin
      Log(Format('Service recovery command failed: %d', [ResultCode]));
      MsgBox('安装未完成，原采集服务恢复失败。请检查 Windows 服务中的 Pulse Agent 状态。', mbError, MB_OK);
    end else begin
      RecoveryError := WaitForPulseServiceRunning;
      if RecoveryError <> '' then begin
        Log(RecoveryError);
        MsgBox('安装未完成。' + RecoveryError + '请检查 Windows 服务中的 Pulse Agent 状态及安装日志。', mbError, MB_OK);
      end else
        Log('Service recovery verified: pulse-agent is running.');
    end;
  end;
end;

function GetDefaultInstallDir(Param: String): String;
var
  Drive: String;
  I: Integer;
begin
  { Prefer the first fixed local drive other than the system drive. }
  for I := 68 to 90 do begin
    Drive := Chr(I) + ':\';
    if (Drive <> ExtractFileDrive(ExpandConstant('{sys}'))) and (GetDriveType(Drive) = 3) then begin
      Result := Drive + 'Pulse Agent';
      exit;
    end;
  end;
  Result := ExpandConstant('{autopf}\Pulse Agent');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpSelectDir) and (not CDriveWarningShown) and
     (Uppercase(ExtractFileDrive(WizardDirValue)) = Uppercase(ExtractFileDrive(ExpandConstant('{sys}')))) then begin
    CDriveWarningShown := True;
    Result := MsgBox('当前安装位置在系统盘 C 盘。程序和采集数据会占用该磁盘空间，是否确认继续？', mbConfirmation, MB_YESNO) = IDYES;
    if not Result then
      CDriveWarningShown := False;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  DeleteUserDataValue := True;
  Result := True;
  if MsgBox('卸载 Pulse Agent 将停止并删除后台服务。默认会彻底删除连接配置、凭据、缓存和日志，重新安装后需要重新连接。是否继续？', mbConfirmation, MB_YESNO) <> IDYES then begin
    Result := False;
    exit;
  end;
  if MsgBox('最后确认：选择“是”将删除本机全部 Pulse Agent 数据；选择“否”则保留配置、凭据、缓存和日志。', mbConfirmation, MB_YESNO) <> IDYES then
    DeleteUserDataValue := False;
end;

function ShouldDeleteUserData(): Boolean;
begin
  Result := DeleteUserDataValue;
end;
