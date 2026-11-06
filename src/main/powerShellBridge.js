import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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

$async = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$typeName = 'System.WindowsRuntimeSystemExtensions'
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]

$asTask = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$netTask = $asTask.Invoke($null, @($async))
$null = $netTask.Wait(-1)
$sessionManager = $netTask.Result

while ($true) {
    $session = $sessionManager.GetCurrentSession()
    
    # If no SMTC session, fallback to window title scraping
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
    $asTask2Generic = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]
    $asTask2 = $asTask2Generic.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $netTask2 = $asTask2.Invoke($null, @($mediaAsync))
    $null = $netTask2.Wait(-1)
    $mediaProps = $netTask2.Result

    $timeline = $session.GetTimelineProperties()
    $playbackInfo = $session.GetPlaybackInfo()

    $title = $mediaProps.Title
    $artist = $mediaProps.Artist
    $isPlaying = $playbackInfo.PlaybackStatus -eq 'Playing'
    $positionMs = [long]$timeline.Position.TotalMilliseconds

    # Extrapolate actual position to eliminate 1-2s lag
    if ($isPlaying -and $null -ne $timeline.LastUpdatedTime) {
        $now = [DateTimeOffset]::UtcNow
        $diff = ($now - $timeline.LastUpdatedTime).TotalMilliseconds
        if ($diff -gt 0) {
            $positionMs += [long]$diff
        }
    }

    Write-Output "SMTC_DATA|||$title|||$artist|||$isPlaying|||$positionMs"
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 500
}
`.trim()

const smtcScriptPath = join(tmpdir(), 'lyricfloat_smtc_loop.ps1')

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */
export function startSMTCBridge(onSongChanged) {
  stopSMTCBridge()

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
        if (parts.length < 5) continue
        const info = {
          title: parts[1],
          artist: parts[2],
          isPlaying: parts[3] === 'True',
          positionMs: parseInt(parts[4], 10) || 0
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
              positionMs: 0
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
                positionMs: 0
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
