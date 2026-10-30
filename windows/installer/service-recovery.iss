function WaitForPulseServiceRunning: String;
var
  Manager, Service: LongWord;
  Status: TPulseServiceStatus;
  Attempt: Integer;
begin
  Result := '';
  Manager := OpenSCManager('', '', 1);
  if Manager = 0 then begin
    Log(Format('Recovery OpenSCManager failed: %d', [DLLGetLastError]));
    Result := '无法确认原采集服务是否恢复：无法访问服务管理器。';
    exit;
  end;
  try
    Service := OpenService(Manager, 'pulse-agent', $0004);
    if Service = 0 then begin
      Log(Format('Recovery OpenService failed: %d', [DLLGetLastError]));
      Result := '无法确认原采集服务是否恢复：无法读取服务。';
      exit;
    end;
    try
      for Attempt := 0 to 60 do begin
        if not QueryServiceStatus(Service, Status) then begin
          Log(Format('Recovery QueryServiceStatus failed: %d', [DLLGetLastError]));
          Result := '无法确认原采集服务是否恢复：状态查询失败。';
          exit;
        end;
        if Status.CurrentState = 4 then exit;
        if Attempt < 60 then Sleep(500);
      end;
      Log(Format('Recovery timed out: state=%d, win32=%d, service=%d', [Status.CurrentState, Status.Win32ExitCode, Status.ServiceSpecificExitCode]));
      Result := '原采集服务未在 30 秒内恢复运行。';
    finally
      CloseServiceHandle(Service);
    end;
  finally
    CloseServiceHandle(Manager);
  end;
end;
