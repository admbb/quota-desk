param([switch]$Disable)
$ErrorActionPreference = 'Stop'

$taskName = 'Quota Desk - User Startup'
$taskDescription = 'Managed by Quota Desk: starts the local dashboard at this Windows user logon.'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($Disable) {
  if (-not $existing) { Write-Output 'Quota Desk auto-start is not installed.'; exit 0 }
  if ($existing.Description -ne $taskDescription) { throw "The task '$taskName' is not managed by this Quota Desk installation; it was left unchanged." }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output 'Quota Desk auto-start removed. The running dashboard was left untouched.'
  exit 0
}

if ($existing -and $existing.Description -ne $taskDescription) {
  throw "The task '$taskName' already exists and is not managed by this Quota Desk installation; it was left unchanged."
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$startupScript = Join-Path $PSScriptRoot 'Start-QuotaDesk.ps1'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $startupScript + '" -NoBrowser'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Description $taskDescription -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Quota Desk will start in the background when $($identity.Name) signs in. No administrator rights are used."
