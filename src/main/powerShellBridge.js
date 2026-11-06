import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
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

while ($true) {
    $session = $null

    # Try GetSessions first — pick the playing session, prefer the previous sourceApp
    try {
        $sessions = $sessionManager.GetSessions()
        if ($sessions.Count -gt 0) {
            $playing = @($sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' })
            if ($playing.Count -gt 0) {
                $session = $playing[0]
                if ($playing.Count -gt 1 -and $lastSourceApp -ne '') {
                    foreach ($s in $playing) {
                        if ($s.SourceAppUserModelId -eq $lastSourceApp) {
                            $session = $s
                            break
                        }
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
        $procs = Get-Process spotify, chrome, msedge, firefox -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' }
        foreach ($p in $procs) {
            Write-Output "FALLBACK_DATA|||$($p.ProcessName)|||$($p.MainWindowTitle)"
        }
        Write-Output "FALLBACK_END|||"
        [Console]::Out.Flush()
        Start-Sleep -Milliseconds 1000
        continue
    }

    $mediaAsync = $session.TryGetMediaPropertiesAsync()
    $netTask2 = $asTask2.Invoke($null, @($mediaAsync))
    $null = $netTask2.Wait(-1)
    $mediaProps = $netTask2.Result

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
    $durationMs = 0
    try {
        $dur = ($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
        if ($dur -gt 0) { $durationMs = [long]$dur }
    } catch {}

    # Extrapolate actual position to eliminate 1-2s lag
    if ($isPlaying -and $null -ne $timeline.LastUpdatedTime) {
        $now = [DateTimeOffset]::UtcNow
        $diff = ($now - $timeline.LastUpdatedTime).TotalMilliseconds
        if ($diff -gt 0) {
            $positionMs += [long]$diff
        }
    }

    Write-Output "SMTC_DATA|||$title|||$artist|||$isPlaying|||$positionMs|||$durationMs|||$sourceApp|||$album"
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 500
}
`.trim()

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */
export function startSMTCBridge(onSongChanged) {
  stopSMTCBridge()

  const smtcScriptPath = join(app.getPath('userData'), 'lyricfloat_smtc_loop.ps1')
  try {
    writeFileSync(smtcScriptPath, SMTC_SCRIPT)
  } catch (e) {}

  // Start persistent powershell process
  psChild = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', smtcScriptPath])

  let buffer = ''
  psChild.stdout.on('data', (data) => {
    buffer += data.toString()
    let lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line
    
    for (let line of lines) {
      line = line.trim()
      if (!line) continue
      
      // Handle SMTC Data
      if (line.startsWith('SMTC_DATA|||')) {
        activeFallbackKey = ''
        pendingFallbackKey = null
        pendingFallbackCount = 0
        fallbackLines = []
        const parts = line.split('|||')
        if (parts.length < 8) continue
        const durationMs = parseInt(parts[5], 10) || 0
        const info = {
          title: parts[1],
          artist: parts[2],
          isPlaying: parts[3] === 'True',
          positionMs: parseInt(parts[4], 10) || 0,
          durationMs: durationMs > 0 ? durationMs : null,
          sourceApp: parts[6] || null,
          album: parts[7] || null
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
          // Spotify: "Artist - Title" or "Title - Artist" or "Spotify Premium"
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
          }
          // Browser: often "Title - YouTube" or "Song • Artist" etc.
          else if (windowTitle.includes(' - YouTube')) {
            const raw = windowTitle.replace(' - YouTube', '').trim()
            const dashIdx = raw.lastIndexOf(' - ')
            if (dashIdx > 0) {
              info = {
                title: raw.slice(0, dashIdx).trim(),
                artist: raw.slice(dashIdx + 3).trim(),
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
    console.error("SMTC child stderr:", data.toString())
  })
  
  psChild.on('close', (code) => {
    console.log("SMTC process exited with code", code)
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
