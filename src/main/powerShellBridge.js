import { exec, spawn } from 'child_process'
import { writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let psChild = null
let lastSongKey = ''
let lastFallbackTime = 0

/* ------------------------------------------------------------------ */
/*  Primary: SMTC via WinRT (Persistent Process)                      */
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
    if ($null -eq $session) {
        Write-Output 'NO_SESSION'
        [Console]::Out.Flush()
        Start-Sleep -Milliseconds 500
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
    Start-Sleep -Milliseconds 100
}
`.trim()

const smtcScriptPath = join(tmpdir(), 'lyricfloat_smtc_loop.ps1')
try { writeFileSync(smtcScriptPath, SMTC_SCRIPT) } catch(e) {}

/* ------------------------------------------------------------------ */
/*  Fallback: window-title scraping                                   */
/* ------------------------------------------------------------------ */
const TITLE_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$procs = Get-Process spotify, chrome, msedge, firefox -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' }
foreach ($p in $procs) { Write-Output "$($p.ProcessName)|||$($p.MainWindowTitle)" }
`.trim()

const titleScriptPath = join(tmpdir(), 'lyricfloat_title.ps1')
try { writeFileSync(titleScriptPath, TITLE_SCRIPT) } catch(e) {}

function runTitleScrape() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${titleScriptPath}"`,
      { timeout: 3000 },
      (err, stdout, stderr) => {
        if (err || !stdout) { resolve(null); return }
        const lines = stdout.trim().split('\n')
        for (const line of lines) {
          const [proc, ...rest] = line.split('|||')
          const windowTitle = rest.join('|||').trim()

          // Spotify: "Artist - Title" or "Title - Artist" or "Spotify Premium"
          if (proc && proc.toLowerCase().includes('spotify') && windowTitle.includes(' - ')) {
            const dashIdx = windowTitle.indexOf(' - ')
            resolve({
              title: windowTitle.slice(dashIdx + 3).trim(),
              artist: windowTitle.slice(0, dashIdx).trim(),
              isPlaying: true,
              positionMs: 0
            })
            return
          }

          // Browser: often "Title - YouTube" or "Song • Artist" etc.
          if (windowTitle.includes(' - YouTube')) {
            const raw = windowTitle.replace(' - YouTube', '').trim()
            const dashIdx = raw.lastIndexOf(' - ')
            if (dashIdx > 0) {
              resolve({
                title: raw.slice(0, dashIdx).trim(),
                artist: raw.slice(dashIdx + 3).trim(),
                isPlaying: true,
                positionMs: 0
              })
              return
            }
          }
        }
        resolve(null)
      }
    )
  })
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */
function handleNewInfo(info, onSongChanged) {
  if (!info) return
  const key = `${info.title}|${info.artist}`
  const songChanged = key !== lastSongKey

  if (songChanged) {
    lastSongKey = key
    onSongChanged({ ...info, songChanged: true })
  } else {
    onSongChanged({ ...info, songChanged: false })
  }
}

async function triggerFallbackTitleScrape(onSongChanged) {
  const now = Date.now()
  if (now - lastFallbackTime < 500) return
  lastFallbackTime = now
  
  const info = await runTitleScrape()
  if (info) {
    handleNewInfo(info, onSongChanged)
  }
}

export function startSMTCBridge(onSongChanged) {
  stopSMTCBridge()

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
      
      if (line === 'NO_SESSION') {
        triggerFallbackTitleScrape(onSongChanged)
        continue
      }
      
      if (line.startsWith('SMTC_DATA|||')) {
        const parts = line.split('|||')
        if (parts.length < 5) continue
        const info = {
          title: parts[1],
          artist: parts[2],
          isPlaying: parts[3] === 'True',
          positionMs: parseInt(parts[4], 10) || 0
        }
        handleNewInfo(info, onSongChanged)
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
  lastFallbackTime = 0
  lastSongKey = ''
}
