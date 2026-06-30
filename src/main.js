import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './style.css'

let renderer = null
let animationId = null
let scene, camera
let particles = null
let particleGeometry = null
let particleMaterial = null
let sphere = null
let sphereGeometry = null
let sphereMaterial = null
let sphereGlow = null
let sphereGlowGeometry = null
let sphereGlowMaterial = null
let rings = []
let ringParticles = null
let ringParticleGeometry = null
let ringParticleMaterial = null
let controls = null

let audioContext = null
let analyser = null
let audioBuffer = null
let source = null
let gainNode = null
let dataArray = null
let startTime = 0
let pauseTime = 0
let currentMode = 'all'
let autoNext = true
let isDragging = false
let isPlaying = false

let playlist = []
let currentTrackIndex = -1
let audioBuffers = []

let fps = 0
let frameCount = 0
let lastFpsTime = 0

async function init() {
  cleanup()

  scene = new THREE.Scene()
  scene.background = null
  scene.fog = null

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 3.5, 15)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  document.getElementById('container').appendChild(renderer.domElement)

  createParticles()
  createSphere()
  createFPSMonitor()

  initControls()

  initAudio()

  function animate() {
    animationId = requestAnimationFrame(animate)
    controls.update()
    updateParticles()
    updateSphere()
    updateSceneRotation()
    updateProgress()
    updateFPS()
    renderer.render(scene, camera)
  }
  animate()

  function initControls() {
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableZoom = true
    controls.enablePan = false
    controls.minDistance = 4
    controls.maxDistance = 40
    controls.autoRotate = false
  }

  function createParticles() {
    const particleCount = 6000
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const originalPositions = new Float32Array(particleCount * 3)
    const hueOffsets = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3

      const r = 6 + Math.random() * 4
      const theta = Math.acos(2 * Math.random() - 1)
      const phi = Math.random() * Math.PI * 2

      positions[i3] = r * Math.sin(theta) * Math.cos(phi)
      positions[i3 + 1] = r * Math.cos(theta)
      positions[i3 + 2] = r * Math.sin(theta) * Math.sin(phi)

      originalPositions[i3] = positions[i3]
      originalPositions[i3 + 1] = positions[i3 + 1]
      originalPositions[i3 + 2] = positions[i3 + 2]

      hueOffsets[i] = Math.random() * 360
    }

    particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    particleGeometry.userData.originalPositions = originalPositions
    particleGeometry.userData.hueOffsets = hueOffsets

    particleMaterial = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    particles = new THREE.Points(particleGeometry, particleMaterial)
    scene.add(particles)
  }

  function updateParticles() {
    if (!particles || !particleGeometry) return

    const frequencies = getFrequencyData()
    let lowFreqIntensity = 0

    if (frequencies.length > 0) {
      const lowFreqCount = Math.floor(frequencies.length * 0.1)
      for (let i = 0; i < lowFreqCount; i++) {
        lowFreqIntensity += frequencies[i]
      }
      lowFreqIntensity /= lowFreqCount
    }

    const positions = particleGeometry.attributes.position.array
    const colors = particleGeometry.attributes.color.array
    const originalPositions = particleGeometry.userData.originalPositions
    const hueOffsets = particleGeometry.userData.hueOffsets
    const count = positions.length / 3

    const spreadFactor = lowFreqIntensity * 2
    const opacity = 0.3 + lowFreqIntensity * 0.7

    particleMaterial.opacity = opacity

    const hueSpeed = 0.02
    const baseHue = (performance.now() * hueSpeed) % 360

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      const origX = originalPositions[i3]
      const origY = originalPositions[i3 + 1]
      const origZ = originalPositions[i3 + 2]

      const dist = Math.sqrt(origX * origX + origY * origY + origZ * origZ)
      if (dist > 0) {
        const dirX = origX / dist
        const dirY = origY / dist
        const dirZ = origZ / dist

        positions[i3] = origX + dirX * spreadFactor
        positions[i3 + 1] = origY + dirY * spreadFactor
        positions[i3 + 2] = origZ + dirZ * spreadFactor
      }

      const hue = (baseHue + hueOffsets[i]) % 360
      const color = new THREE.Color().setHSL(hue / 360, 1, 0.5)
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
    }

    particleGeometry.attributes.position.needsUpdate = true
    particleGeometry.attributes.color.needsUpdate = true
    particles.rotation.y += 0.001
  }

  function createSphere() {
    // 主体 — 实体 Phong 材质，半径 2.5，面数 64
    sphereGeometry = new THREE.SphereGeometry(2.5, 64, 64)
    sphereMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#222222'),
      emissive: new THREE.Color('#000000'),
      specular: new THREE.Color('#444444'),
      shininess: 80,
      transparent: true,
      opacity: 0.9
    })
    sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.y = 2
    scene.add(sphere)

    // 保存顶点原始位置用于法向变形
    const positions = sphereGeometry.attributes.position.array
    const originalPositions = new Float32Array(positions.length)
    originalPositions.set(positions)
    sphereGeometry.userData.originalPositions = originalPositions

    // 外发光球壳 — 半透明，比主体大 0.3
    sphereGlowGeometry = new THREE.SphereGeometry(2.8, 64, 64)
    sphereGlowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#333333'),
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false
    })
    sphereGlow = new THREE.Mesh(sphereGlowGeometry, sphereGlowMaterial)
    sphereGlow.position.y = 2
    scene.add(sphereGlow)

    // === 添加环境光确保暗面可视 ===
    const ambientLight = new THREE.AmbientLight(0x222222, 0.5)
    ambientLight.name = 'sphereAmbient'
    scene.add(ambientLight)
    sphere.userData.ambientLight = ambientLight

    // 添加一个点光源照亮实体球
    const pointLight = new THREE.PointLight(0x444444, 2, 15)
    pointLight.position.set(0, 2, 0)
    scene.add(pointLight)
    // 存到 userData 以便后续清理
    sphere.userData.pointLight = pointLight

    // === 创建5个半透明圆环 ===
    const ringCount = 5
    const minRadius = 2.8
    const maxRadius = 4.5
    const radiusStep = (maxRadius - minRadius) / (ringCount - 1)
    
    for (let i = 0; i < ringCount; i++) {
      const radius = minRadius + i * radiusStep
      const tubeRadius = 0.03
      const geometry = new THREE.TorusGeometry(radius, tubeRadius, 8, 64)
      
      const t = i / (ringCount - 1)
      const color = new THREE.Color().lerpColors(
        new THREE.Color('#555555'),
        new THREE.Color('#111111'),
        t
      )
      const opacity = 0.15 + t * 0.25
      
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      
      const ring = new THREE.Mesh(geometry, material)
      ring.position.y = 2
      
      const angle1 = (i * Math.PI * 2) / ringCount
      const angle2 = (i * Math.PI) / ringCount
      ring.rotation.x = Math.sin(angle1) * 0.3 + Math.PI / 2
      ring.rotation.z = Math.cos(angle2) * 0.5
      
      scene.add(ring)
      rings.push(ring)
    }

    // === 创建环轨道上的微型粒子 ===
    const ringParticleCount = 500
    const ringParticlePositions = new Float32Array(ringParticleCount * 3)
    const ringParticleColors = new Float32Array(ringParticleCount * 3)
    const ringParticleRingIndices = new Float32Array(ringParticleCount)
    const ringParticleOffsets = new Float32Array(ringParticleCount)
    
    for (let i = 0; i < ringParticleCount; i++) {
      const ringIndex = i % ringCount
      const ringRadius = minRadius + ringIndex * radiusStep
      const offset = (i / ringParticleCount) * Math.PI * 2
      
      ringParticleRingIndices[i] = ringIndex
      ringParticleOffsets[i] = offset
      
      const x = ringRadius * Math.cos(offset)
      const y = 2
      const z = ringRadius * Math.sin(offset)
      
      ringParticlePositions[i * 3] = x
      ringParticlePositions[i * 3 + 1] = y
      ringParticlePositions[i * 3 + 2] = z
      
      const t = ringIndex / (ringCount - 1)
      const color = new THREE.Color().lerpColors(
        new THREE.Color('#666666'),
        new THREE.Color('#222222'),
        t
      )
      ringParticleColors[i * 3] = color.r
      ringParticleColors[i * 3 + 1] = color.g
      ringParticleColors[i * 3 + 2] = color.b
    }
    
    ringParticleGeometry = new THREE.BufferGeometry()
    ringParticleGeometry.setAttribute('position', new THREE.BufferAttribute(ringParticlePositions, 3))
    ringParticleGeometry.setAttribute('color', new THREE.BufferAttribute(ringParticleColors, 3))
    ringParticleGeometry.userData.ringIndices = ringParticleRingIndices
    ringParticleGeometry.userData.offsets = ringParticleOffsets
    
    ringParticleMaterial = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    
    ringParticles = new THREE.Points(ringParticleGeometry, ringParticleMaterial)
    scene.add(ringParticles)
  }

  function updateSphere() {
    if (!sphere || !sphereGeometry || !sphereGlow) return

    const frequencies = getFrequencyData()
    const t = performance.now() * 0.005

    // === 整体低频脉冲强度 ===
    let lowPulse = 0
    let midPulse = 0
    let highRipple = 0
    if (frequencies.length === 0) {
      // 无频谱时缓慢呼吸
      lowPulse = 0.3 + 0.1 * Math.sin(performance.now() * 0.002)
      midPulse = 0.2 + 0.1 * Math.sin(performance.now() * 0.003)
      highRipple = 0.1
    } else {
      const lowCount = Math.floor(frequencies.length * 0.15)
      for (let i = 0; i < lowCount; i++) lowPulse += frequencies[i]
      lowPulse /= lowCount

      const midStart = Math.floor(frequencies.length * 0.2)
      const midEnd = Math.floor(frequencies.length * 0.6)
      for (let i = midStart; i < midEnd; i++) midPulse += frequencies[i]
      midPulse /= (midEnd - midStart)

      const highStart = Math.floor(frequencies.length * 0.4)
      for (let i = highStart; i < frequencies.length; i++) highRipple += frequencies[i]
      highRipple /= (frequencies.length - highStart)
    }

    // === 主体球：低频整体膨胀 + 高频表面波动 ===
    const positions = sphereGeometry.attributes.position.array
    const originalPositions = sphereGeometry.userData.originalPositions
    const count = positions.length / 3
    const basePulse = 1 + lowPulse * 0.35
    const rippleAmp = highRipple * 0.25

    // 复用 Vector3 避免频繁 new
    const norm = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const ox = originalPositions[i3]
      const oy = originalPositions[i3 + 1]
      const oz = originalPositions[i3 + 2]

      // 预计算法线反长
      const invLen = 1 / Math.sqrt(ox * ox + oy * oy + oz * oz)
      norm.set(ox * invLen, oy * invLen, oz * invLen)

      // 顶点级波动
      const wave = Math.sin(norm.x * 6 + norm.y * 5 + norm.z * 4 + t * 8 + i * 0.3) * rippleAmp
      const s = basePulse + wave
      positions[i3] = ox * s
      positions[i3 + 1] = oy * s
      positions[i3 + 2] = oz * s
    }
    sphereGeometry.attributes.position.needsUpdate = true

    // === 自发光随低频鼓点闪烁 ===
    const emissiveBase = 0.05
    const emissivePulse = lowPulse * 0.6 + midPulse * 0.3
    const emissiveIntensity = Math.min(emissiveBase + emissivePulse, 0.5)
    sphereMaterial.emissive.set(new THREE.Color(
      emissiveIntensity,
      emissiveIntensity,
      emissiveIntensity
    ))

    // === 光晕壳随低频膨胀收缩 + 透明度闪烁 ===
    const glowPulse = basePulse + midPulse * 0.2
    sphereGlow.scale.setScalar(glowPulse)
    sphereGlowMaterial.opacity = 0.03 + lowPulse * 0.35 + midPulse * 0.15

    // === 圆环动画：跟随中频波动 ===
    rings.forEach((ring, i) => {
      const ringBaseScale = 1 + lowPulse * 0.15
      const ringMidPulse = 1 + midPulse * 0.1
      const ringScale = ringBaseScale * ringMidPulse
      ring.scale.setScalar(ringScale)
      
      const baseOpacity = ring.material.opacity * 0.5
      const pulseOpacity = (lowPulse * 0.3 + midPulse * 0.2) * (1 - i / rings.length)
      ring.material.opacity = baseOpacity + pulseOpacity
      
      ring.rotation.y += 0.002 + midPulse * 0.003
    })

    // === 环轨道粒子流动 ===
    if (ringParticles && ringParticleGeometry) {
      const particlePositions = ringParticleGeometry.attributes.position.array
      const ringIndices = ringParticleGeometry.userData.ringIndices
      const offsets = ringParticleGeometry.userData.offsets
      const minRadius = 2.8
      const maxRadius = 4.5
      const radiusStep = (maxRadius - minRadius) / (rings.length - 1)
      
      const flowSpeed = 0.02 + midPulse * 0.03
      
      for (let i = 0; i < particlePositions.length / 3; i++) {
        const ringIndex = Math.floor(ringIndices[i])
        const ringRadius = minRadius + ringIndex * radiusStep
        const baseOffset = offsets[i]
        const timeOffset = performance.now() * flowSpeed * 0.001
        
        const angle = baseOffset + timeOffset + i * 0.001
        const x = ringRadius * Math.cos(angle)
        const y = 2 + Math.sin(angle * 2 + t * 3) * 0.1 * lowPulse
        const z = ringRadius * Math.sin(angle)
        
        particlePositions[i * 3] = x
        particlePositions[i * 3 + 1] = y
        particlePositions[i * 3 + 2] = z
      }
      
      ringParticleGeometry.attributes.position.needsUpdate = true
      ringParticleMaterial.opacity = 0.4 + lowPulse * 0.4
    }

    // === 旋转 ===
    sphere.rotation.y += 0.003
    sphere.rotation.x += 0.0015
    sphereGlow.rotation.copy(sphere.rotation)
  }

  function createFPSMonitor() {
    const fpsDiv = document.createElement('div')
    fpsDiv.id = 'fpsMonitor'
    fpsDiv.style.position = 'fixed'
    fpsDiv.style.top = '20px'
    fpsDiv.style.right = '20px'
    fpsDiv.style.color = '#00ffff'
    fpsDiv.style.fontFamily = 'monospace'
    fpsDiv.style.fontSize = '14px'
    fpsDiv.style.zIndex = '100'
    fpsDiv.style.textShadow = '0 0 5px rgba(0, 255, 255, 0.5)'
    fpsDiv.textContent = 'FPS: 60'
    document.body.appendChild(fpsDiv)
  }

  function updateFPS() {
    frameCount++
    const t = performance.now()
    if (t - lastFpsTime >= 1000) {
      fps = Math.round(frameCount * 1000 / (t - lastFpsTime))
      frameCount = 0
      lastFpsTime = t
      const fpsDiv = document.getElementById('fpsMonitor')
      if (fpsDiv) {
        fpsDiv.textContent = `FPS: ${fps}`
        fpsDiv.style.color = fps >= 50 ? '#00ffff' : fps >= 30 ? '#ffff00' : '#ff0000'
      }
    }
  }

  function updateSceneRotation() {
    const baseSpeed = 0.0003
    const playingSpeed = 0.0015
    const speed = isPlaying ? playingSpeed : baseSpeed
    scene.rotation.y += speed
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onWindowResize)

  window.scene = scene
  window.camera = camera
  window.particles = particles
  window.sphere = sphere
  window.sphereGlow = sphereGlow
  window.renderer = renderer
  window.controls = controls
  window.analyser = analyser
  window.dataArray = dataArray
  window.play = play
  window.pause = pause
  window.stop = stop
  window.getFrequencyData = getFrequencyData
}

function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 512
  dataArray = new Uint8Array(analyser.frequencyBinCount)
  gainNode = audioContext.createGain()
  gainNode.gain.value = 1

  // 一次性建立节点链 analyser → gainNode → destination
  analyser.connect(gainNode)
  gainNode.connect(audioContext.destination)

  const audioInput = document.getElementById('audioInput')
  const playBtn = document.getElementById('playBtn')
  const prevBtn = document.getElementById('prevBtn')
  const nextBtn = document.getElementById('nextBtn')
  const progressBar = document.getElementById('progressBar')
  const volumeSlider = document.getElementById('volumeSlider')

  audioInput.addEventListener('change', handleFileUpload)
  playBtn.addEventListener('click', togglePlay)
  prevBtn.addEventListener('click', playPrev)
  nextBtn.addEventListener('click', playNext)

  progressBar.addEventListener('pointerdown', (e) => {
    isDragging = true
    e.target.setPointerCapture(e.pointerId)
})
progressBar.addEventListener('input', (e) => {
    updateTimeDisplay(e)
})
progressBar.addEventListener('pointerup', () => {
    isDragging = false
    seekTo()
})
  volumeSlider.addEventListener('input', setVolume)

  const modeBtns = document.querySelectorAll('.mode-btn-v')
  modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.dataset.mode
      switchMode(mode)
    })
  })

  const autoNextBtn = document.getElementById('autoNextBtn')
  autoNextBtn.addEventListener('click', toggleAutoNext)

  const panelToggleBtn = document.getElementById('panelToggleBtn')
  panelToggleBtn.addEventListener('click', togglePanel)
}

function togglePanel() {
  const leftPanel = document.getElementById('left-panel')
  const rightPanel = document.getElementById('right-panel')
  const toggleBtn = document.getElementById('panelToggleBtn')
  
  const leftStyle = window.getComputedStyle(leftPanel)
  const isVisible = leftStyle.display !== 'none'
  
  if (isVisible) {
    leftPanel.style.display = 'none'
    rightPanel.style.display = 'none'
    toggleBtn.classList.remove('active')
    toggleBtn.setAttribute('aria-label', '显示面板')
  } else {
    leftPanel.style.display = 'flex'
    rightPanel.style.display = 'flex'
    toggleBtn.classList.add('active')
    toggleBtn.setAttribute('aria-label', '隐藏面板')
  }
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return

  stop()

  playlist = []
  audioBuffers = []

  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = await audioContext.decodeAudioData(arrayBuffer)
      audioBuffers.push(buffer)
      playlist.push({
        name: file.name.replace(/\.[^/.]+$/, ''),
        buffer: buffer
      })
    } catch (error) {
      console.error('Failed to decode audio:', file.name, error)
    }
  }

  renderPlaylist()

  if (playlist.length > 0) {
    currentTrackIndex = 0
    audioBuffer = playlist[0].buffer
    document.getElementById('songName').textContent = playlist[0].name
    document.getElementById('timeDisplay').textContent = `00:00 / ${formatTime(audioBuffer.duration)}`
  }
}

function renderPlaylist() {
  const playlistItems = document.getElementById('playlistItems')
  playlistItems.innerHTML = ''

  playlist.forEach((item, index) => {
    const div = document.createElement('div')
    div.className = `playlist-item${index === currentTrackIndex ? ' active' : ''}`
    div.textContent = `${index + 1}. ${item.name}`
    div.addEventListener('click', () => {
      playTrack(index)
    })
    playlistItems.appendChild(div)
  })
}

async function playTrack(index) {
  if (index < 0 || index >= playlist.length) return

  stop()

  currentTrackIndex = index
  audioBuffer = playlist[index].buffer
  pauseTime = 0

  document.getElementById('songName').textContent = playlist[index].name
  document.getElementById('timeDisplay').textContent = `00:00 / ${formatTime(audioBuffer.duration)}`
  document.getElementById('progressBar').value = 0

  renderPlaylist()
  await play()
}

function playPrev() {
  if (playlist.length === 0) return
  let newIndex = currentTrackIndex - 1
  if (newIndex < 0) {
    newIndex = playlist.length - 1
  }
  playTrack(newIndex)
}

function playNext() {
  if (playlist.length === 0) return
  let newIndex = currentTrackIndex + 1
  if (newIndex >= playlist.length) {
    newIndex = 0
  }
  playTrack(newIndex)
}

async function togglePlay() {
  if (source) {
    pause()
  } else {
    await play()
  }
}

async function play() {
  if (!audioBuffer) {
    console.warn('No audio file loaded')
    return
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  source = audioContext.createBufferSource()
  source.buffer = audioBuffer
  source.connect(analyser)

  const offset = pauseTime > 0 ? pauseTime : 0
  startTime = audioContext.currentTime - offset
  source.start(0, offset)

  isPlaying = true
  updatePlayButton('pause')

  source.onended = onTrackEnd
}

function pause() {
  if (!source) return

  pauseTime = audioContext.currentTime - startTime
  source.onended = null
  source.stop()
  source.disconnect()
  source = null

  isPlaying = false
  updatePlayButton('play')
}

function stop() {
  if (source) {
    source.onended = null
    source.stop()
    source.disconnect()
    source = null
  }

  isPlaying = false
  startTime = 0
  pauseTime = 0

  updatePlayButton('play')
  document.getElementById('progressBar').value = 0
  document.getElementById('timeDisplay').textContent = '00:00 / 00:00'
}

async function onTrackEnd() {
  if (autoNext && currentTrackIndex < playlist.length - 1) {
    await playTrack(currentTrackIndex + 1)
  } else {
    stop()
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function updatePlayButton(state) {
  const btn = document.getElementById('playBtn')
  if (state === 'play') {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
    btn.setAttribute('aria-label', '播放')
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
    btn.setAttribute('aria-label', '暂停')
  }
}

function updateProgress() {
  if (isDragging) return
  if (!audioBuffer || !source) return

  const progressBar = document.getElementById('progressBar')
  const timeDisplay = document.getElementById('timeDisplay')
  const duration = audioBuffer.duration
  let currentTime = audioContext.currentTime - startTime

  if (currentTime < 0) currentTime = 0
  if (currentTime > duration) currentTime = duration

  const progress = (currentTime / duration) * 100
  progressBar.value = Math.min(progress, 100)
  timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`
}

function updateTimeDisplay(event) {
  if (!audioBuffer) return

  const progressBar = event.target
  const duration = audioBuffer.duration
  const newTime = (progressBar.value / 100) * duration
  const timeDisplay = document.getElementById('timeDisplay')
  timeDisplay.textContent = `${formatTime(newTime)} / ${formatTime(duration)}`
}

async function seekTo() {
  if (!audioBuffer) return

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  const progressBar = document.getElementById('progressBar')
  const duration = audioBuffer.duration
  const newTime = (progressBar.value / 100) * duration

  if (source) {
    source.onended = null
    source.stop()
    source.disconnect()
  }

  pauseTime = newTime
  startTime = audioContext.currentTime - newTime

  source = audioContext.createBufferSource()
  source.buffer = audioBuffer
  source.connect(analyser)
  source.start(0, newTime)

  updatePlayButton('pause')

  document.getElementById('timeDisplay').textContent = `${formatTime(newTime)} / ${formatTime(duration)}`

  source.onended = onTrackEnd
}

function setVolume(event) {
  if (!gainNode) return
  gainNode.gain.value = event.target.value / 100
}

function switchMode(mode) {
  currentMode = mode

  document.querySelectorAll('.mode-btn-v').forEach(btn => {
    btn.classList.remove('active')
  })
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active')

  const showParticles = mode === 'all' || mode === 'particles'
  const showWave = mode === 'all' || mode === 'wave'

  if (particles) {
    particles.visible = showParticles
  }

  if (sphere) {
    sphere.visible = showWave
  }

  if (sphereGlow) {
    sphereGlow.visible = showWave
  }

  rings.forEach(ring => {
    ring.visible = showWave
  })

  if (ringParticles) {
    ringParticles.visible = showWave
  }
}

function toggleAutoNext() {
  autoNext = !autoNext
  const btn = document.getElementById('autoNextBtn')
  if (autoNext) {
    btn.classList.remove('off')
    btn.setAttribute('aria-label', '自动切歌：开')
  } else {
    btn.classList.add('off')
    btn.setAttribute('aria-label', '自动切歌：关')
  }
}

function getFrequencyData() {
  if (!analyser) return []
  analyser.getByteFrequencyData(dataArray)
  const normalized = new Float32Array(dataArray.length)
  for (let i = 0; i < dataArray.length; i++) {
    normalized[i] = dataArray[i] / 255
  }
  return normalized
}

function cleanup() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  if (renderer) {
    renderer.dispose()
    const canvas = renderer.domElement
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas)
    }
    renderer = null
  }
  if (particleGeometry) {
    particleGeometry.dispose()
    particleGeometry = null
  }
  if (particleMaterial) {
    particleMaterial.dispose()
    particleMaterial = null
  }
  if (sphereGeometry) {
    sphereGeometry.dispose()
    sphereGeometry = null
  }
  if (sphereMaterial) {
    sphereMaterial.dispose()
    sphereMaterial = null
  }
  if (sphereGlowGeometry) {
    sphereGlowGeometry.dispose()
    sphereGlowGeometry = null
  }
  if (sphereGlowMaterial) {
    sphereGlowMaterial.dispose()
    sphereGlowMaterial = null
  }
  rings.forEach(ring => {
    ring.geometry.dispose()
    ring.material.dispose()
  })
  rings = []
  if (ringParticleGeometry) {
    ringParticleGeometry.dispose()
    ringParticleGeometry = null
  }
  if (ringParticleMaterial) {
    ringParticleMaterial.dispose()
    ringParticleMaterial = null
  }
  if (sphere && sphere.userData.pointLight) {
    sphere.userData.pointLight.dispose()
  }
  if (sphere && sphere.userData.ambientLight) {
    sphere.userData.ambientLight.dispose()
  }
  if (controls) {
    controls.dispose()
    controls = null
  }
  if (gainNode) {
    gainNode.disconnect()
    gainNode = null
  }
  if (analyser) {
    analyser.disconnect()
    analyser = null
  }
  if (source) {
    source.stop()
    source.disconnect()
    source = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  const fpsDiv = document.getElementById('fpsMonitor')
  if (fpsDiv) {
    fpsDiv.remove()
  }
}

init()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup()
  })
}
