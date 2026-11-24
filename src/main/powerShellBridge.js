import { spawn } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

let psChild = null

let fallbackLines = []
let lastFallbackSource = null
let pendingFallbackKey = null
let pendingFallbackCount = 0
let activeFallbackKey = ''

/* ------------------------------------------------------------------ */
/*  Primary: SMTC via WinRT + Fallback Title Scraping (Persistent)    */
/* ------------------------------------------------------------------ */
const SMTC_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]

$async = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]

$asTask = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$asTask2 = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])

$netTask = $asTask.Invoke($null, @($async))
$null = $netTask.Wait(-1)
$sessionManager = $netTask.Result

$lastSourceApp = ''
$lastOutputSig = ''
$lastEmitTime = [DateTimeOffset]::MinValue
$lastPosMs = 0L
$lastFallbackSig = ''
$fallbackRepeat = 0

while ($true) {
    $session = $null

    # Try GetSessions first — pick the playing session, prefer the previous sourceApp
    try {
        $sessions = $sessionManager.GetSessions()
        if ($sessions.Count -gt 0) {
            foreach ($s in $sessions) {
                if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') {
                    if ($null -eq $session) {
                        $session = $s
                    } elseif ($lastSourceApp -ne '' -and $s.SourceAppUserModelId -eq $lastSourceApp) {
                        $session = $s
                        break
                    }
                }
            }
        }
    } catch {}

    # Fall back to GetCurrentSession if no playing session found
    if ($null -eq $session) {
        $session = $sessionManager.GetCurrentSession()
    }

    # If no SMTC session at all, fallback to window title scraping
    if ($null -eq $session) {
        $lastOutputSig = ''
        $fbLines = [System.Collections.Generic.List[string]]::new()
        $procs = Get-Process -Name spotify, chrome, msedge, firefox -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            try {
                $wt = $p.MainWindowTitle
                if ($wt) {
                    $fbLines.Add("FALLBACK_DATA|||$($p.ProcessName)|||$wt")
                }
            } finally {
                $p.Dispose()
            }
        }

        $fbSig = [string]::Join("\`n", $fbLines)
        if ($fbSig -ne $lastFallbackSig) {
            $lastFallbackSig = $fbSig
            $fallbackRepeat = 1
        } else {
            $fallbackRepeat++
        }

        # Emit on change and once more to satisfy confirmation threshold, then stay silent while unchanged
        if ($fallbackRepeat -le 2) {
            foreach ($l in $fbLines) {
                Write-Output $l
            }
            Write-Output "FALLBACK_END|||"
            [Console]::Out.Flush()
        }

        Start-Sleep -Milliseconds 2000
        continue
    }

    $lastFallbackSig = ''
    $fallbackRepeat = 0

    $mediaAsync = $session.TryGetMediaPropertiesAsync()
    $netTask2 = $asTask2.Invoke($null, @($mediaAsync))
    $null = $netTask2.Wait(-1)
    $mediaProps = $netTask2.Result
    if ($null -eq $mediaProps) {
        Start-Sleep -Milliseconds 500
        continue
    }

    $timeline = $session.GetTimelineProperties()
    $playbackInfo = $session.GetPlaybackInfo()

    $title = $mediaProps.Title
    $artist = $mediaProps.Artist
    $album = $mediaProps.AlbumTitle
    $isPlaying = $playbackInfo.PlaybackStatus -eq 'Playing'
    $positionMs = [long]$timeline.Position.TotalMilliseconds
    $sourceApp = $session.SourceAppUserModelId
    $lastSourceApp = $sourceApp

    # Duration
    $durationMs = 0L
    try {
        $dur = ($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
        if ($dur -gt 0) { $durationMs = [long]$dur }
    } catch {}

    $now = [DateTimeOffset]::UtcNow

    # Extrapolate actual position to eliminate 1-2s lag
    if ($isPlaying -and $null -ne $timeline.LastUpdatedTime) {
        $diff = ($now - $timeline.LastUpdatedTime).TotalMilliseconds
        if ($diff -gt 0) {
            $positionMs += [long]$diff
        }
    }

    # Delta-emit: avoid waking Node/Electron IPC when nothing changed
    $sig = "$title|||$artist|||$isPlaying|||$durationMs|||$sourceApp|||$album"
    $shouldEmit = $false
    if ($sig -ne $lastOutputSig) {
        $shouldEmit = $true
    } else {
        $elapsed = ($now - $lastEmitTime).TotalMilliseconds
        if ($isPlaying) {
            $expected = $lastPosMs + $elapsed
            if ([Math]::Abs($positionMs - $expected) -gt 1500 -or $elapsed -ge 9000) {
                $shouldEmit = $true
            }
        } elseif ([Math]::Abs($positionMs - $lastPosMs) -gt 1500) {
            $shouldEmit = $true
        }
    }

    if ($shouldEmit) {
        $lastOutputSig = $sig
        $lastEmitTime = $now
        $lastPosMs = $positionMs
        Write-Output "SMTC_DATA|||$sig|||$positionMs"
        [Console]::Out.Flush()
    }

    if ($isPlaying) {
        Start-Sleep -Milliseconds 500
    } else {
        Start-Sleep -Milliseconds 1500
    }
}
`.trim()

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */
export function startSMTCBridge(onSongChanged) {
  stopSMTCBridge()

  const smtcScriptPath = join(app.getPath('userData'), 'lyricfloat_smtc_loop.ps1')
  try {
    let existing = null
    try {
      existing = readFileSync(smtcScriptPath, 'utf8')
    } catch {}
    if (existing !== SMTC_SCRIPT) {
      writeFileSync(smtcScriptPath, SMTC_SCRIPT, 'utf8')
    }
  } catch (e) {}

  // Start persistent powershell process hidden
  psChild = spawn(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', smtcScriptPath],
    { windowsHide: true }
  )

  let buffer = ''
  psChild.stdout.on('data', (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line

    for (let line of lines) {
      line = line.trim()
      if (!line) continue

      // Handle SMTC Data: SMTC_DATA|||$title|||$artist|||$isPlaying|||$durationMs|||$sourceApp|||$album|||$positionMs
      if (line.startsWith('SMTC_DATA|||')) {
        activeFallbackKey = ''
        pendingFallbackKey = null
        pendingFallbackCount = 0
        fallbackLines = []
        const parts = line.split('|||')
        if (parts.length < 8) continue
        const durationMs = parseInt(parts[4], 10) || 0
        const info = {
          title: parts[1],
          artist: parts[2],
          isPlaying: parts[3] === 'True',
          positionMs: parseInt(parts[7], 10) || 0,
          durationMs: durationMs > 0 ? durationMs : null,
          sourceApp: parts[5] || null,
          album: parts[6] || null
        }
        onSongChanged(info)
        continue
      }

      // Handle Fallback Title Data
      if (line.startsWith('FALLBACK_DATA|||')) {
        fallbackLines.push(line)
        continue
      }

      if (line.startsWith('FALLBACK_END|||')) {
        const candidates = []
        for (const raw of fallbackLines) {
          const parts = raw.split('|||')
          const proc = parts[1] || ''
          const windowTitle = parts.slice(2).join('|||').trim()

          let info = null
          const procLower = proc.toLowerCase()
          if (procLower.includes('spotify') && windowTitle.includes(' - ')) {
            const dashIdx = windowTitle.indexOf(' - ')
            info = {
              title: windowTitle.slice(dashIdx + 3).trim(),
              artist: windowTitle.slice(0, dashIdx).trim(),
              isPlaying: true,
              positionMs: 0,
              durationMs: null,
              sourceApp: proc,
              album: null
            }
          } else if (windowTitle.includes(' - YouTube')) {
            const clean = windowTitle.replace(' - YouTube', '').trim()
            const dashIdx = clean.lastIndexOf(' - ')
            if (dashIdx > 0) {
              info = {
                title: clean.slice(0, dashIdx).trim(),
                artist: clean.slice(dashIdx + 3).trim(),
                isPlaying: true,
                positionMs: 0,
                durationMs: null,
                sourceApp: proc,
                album: null
              }
            }
          }

          if (info) {
            candidates.push({ info, proc: procLower })
          }
        }
        fallbackLines = []

        if (candidates.length > 0) {
          let chosen = null
          if (lastFallbackSource) {
            chosen = candidates.find(c => c.proc.includes(lastFallbackSource))
          }
          if (!chosen) {
            const priority = ['spotify', 'chrome', 'msedge', 'firefox']
            for (const p of priority) {
              chosen = candidates.find(c => c.proc.includes(p))
              if (chosen) break
            }
          }
          if (!chosen) {
            chosen = candidates[0]
          }

          lastFallbackSource = chosen.proc
          const chosenInfo = chosen.info
          const key = `${chosenInfo.title}|${chosenInfo.artist}`

          if (key === activeFallbackKey) {
            pendingFallbackKey = null
            pendingFallbackCount = 0
            onSongChanged(chosenInfo)
          } else {
            if (key === pendingFallbackKey) {
              pendingFallbackCount++
              if (pendingFallbackCount >= 2) {
                activeFallbackKey = key
                pendingFallbackKey = null
                pendingFallbackCount = 0
                onSongChanged(chosenInfo)
              }
            } else {
              pendingFallbackKey = key
              pendingFallbackCount = 1
            }
          }
        }
        continue
      }
    }
  })

  psChild.stderr.on('data', (data) => {
    console.error('SMTC child stderr:', data.toString())
  })

  psChild.on('close', (code) => {
    buffer = ''
    console.log('SMTC process exited with code', code)
  })
}

export function stopSMTCBridge() {
  if (psChild) {
    psChild.kill()
    psChild = null
  }
  fallbackLines = []
  lastFallbackSource = null
  pendingFallbackKey = null
  pendingFallbackCount = 0
  activeFallbackKey = ''
}
