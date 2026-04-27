import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let cuboidMesh, edgesMesh;
let gridHelper, axesHelper;
let referenceGroup;
let dragControls;
const clock = new THREE.Clock();

const modelsData = [
    { file: 'bananaforscale-20cm.glb', size: 20, name: 'Banane 20cm', maxDim: 50, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'chair-1m.glb', size: 100, name: 'Stuhl 1m', maxDim: 150, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'human-1.8m.glb', size: 180, name: 'Mensch 1.8m', maxDim: 250, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'car-3.3m.glb', size: 330, name: 'Auto 3.3m', maxDim: 600, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'house-9m.glb', size: 900, name: 'Haus 9m', maxDim: 2000, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    // Der Wal erhält einen expliziten max-Wert, da Skinned Meshes bei Box3 oft fehlschlagen. 
    // rotationY = 0 sorgt dafür, dass er parallel zur Z-Achse schwimmt und nicht kollidiert.
    // Blauwal Blender Dims: X: 10.2, Y: 30.1, Z: 5.04. trueSizeMax überschreibt SkinnedMesh-Fehler. hitboxSize fixt die schwebende BoundingBox.
    { file: 'bluewhale-30m.glb', size: 3000, name: 'Blauwal 30m', maxDim: 10000, rotationY: 0, paddingFactor: 0.8, trueSizeMax: 30.1, hitboxSize: [10.2, 30.1, 5.04] }, 
    { file: 'eiffel tower-330m.glb', size: 33000, name: 'Eiffelturm 330m', maxDim: Infinity, rotationY: -Math.PI / 4, paddingFactor: 0.5 }
];
const loadedModels = {};
const mixers = {}; // Speichert die AnimationMixers für die jeweiligen Modelle
let activeMixer = null;
let currentActiveModelSize = 0;

// --- DOM Elements ---
const container = document.getElementById('canvas-container');
const btnCreate = document.getElementById('btn-create');
const inputLength = document.getElementById('input-length');
const inputWidth = document.getElementById('input-width');
const inputHeight = document.getElementById('input-height');
const checkTransparent = document.getElementById('check-transparent');
const checkCoords = document.getElementById('check-coords');
const checkReference = document.getElementById('check-reference');
const labelReference = document.getElementById('label-reference');

function init() {
    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); 

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000000);
    camera.position.set(20, 20, 30);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.zoomSpeed = 2.0;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(10, 20, 10);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-10, -20, -10);
    scene.add(dirLight2);

    // 6. Coordinate System default
    createOrUpdateCoords(50); 

    // 7. References Group
    referenceGroup = new THREE.Group();
    scene.add(referenceGroup);

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    btnCreate.addEventListener('click', createCuboid);
    checkTransparent.addEventListener('change', updateMaterial);
    checkCoords.addEventListener('change', toggleCoords);
    checkReference.addEventListener('change', toggleReference);

    // Start loading models
    loadAllModels();

    // Start Animation Loop
    animate();
}

function loadAllModels() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const percent = Math.floor((itemsLoaded / itemsTotal) * 100);
        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');
        if (progressBar) progressBar.style.width = percent + '%';
        if (loadingText) loadingText.textContent = percent + '%';
    };

    manager.onLoad = function () {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.style.display = 'none', 500);
        }
        updateReferenceModel();
    };

    const loader = new GLTFLoader(manager);
    modelsData.forEach((data, index) => {
        loader.load('./3d-modelle/' + data.file, function(gltf) {
            const model = gltf.scene;
            
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            let max;
            
            if (data.trueSizeMax) {
                max = data.trueSizeMax;
            } else {
                max = Math.max(size.x, size.y, size.z);
                if (max === 0) return;
            }
            model.position.set(-center.x, -center.y, -center.z);

            // --- ANIMATION MIXER SETUP ---
            if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
                mixers[index] = mixer;
            }
            
            const pivotGroup = new THREE.Group();
            pivotGroup.add(model);
            pivotGroup.rotation.y = data.rotationY !== undefined ? data.rotationY : -Math.PI / 4; 

            // Unsichtbare Hitbox hinzufügen, da Skinned Meshes (Animationen) oft Probleme mit Raycastern haben
            // Nutzen der originalen Proportionen (size) anstatt eines gigantischen Würfels (max, max, max), 
            // damit Modelle wie der Wal nicht künstlich hoch in die Luft gehoben werden.
            const hSize = data.hitboxSize ? new THREE.Vector3(data.hitboxSize[0], data.hitboxSize[1], data.hitboxSize[2]) : size;
            const hitboxGeo = new THREE.BoxGeometry(hSize.x, hSize.y, hSize.z);
            const hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
            const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
            pivotGroup.add(hitbox);

            const scale = data.size / max;
            const wrapper = new THREE.Group();
            wrapper.add(pivotGroup);
            wrapper.scale.set(scale, scale, scale);
            
            wrapper.updateMatrixWorld(true);
            const wrapperBox = new THREE.Box3().setFromObject(wrapper);
            wrapper.position.y = -wrapperBox.min.y;
            
            loadedModels[index] = wrapper;
        });
    });
}

function updateReferenceModel() {
    if (!referenceGroup) return;

    while(referenceGroup.children.length > 0) {
        referenceGroup.remove(referenceGroup.children[0]);
    }

    const l = parseFloat(inputLength.value) || 10;
    const w = parseFloat(inputWidth.value) || 10;
    const h = parseFloat(inputHeight.value) || 10;
    const maxDim = Math.max(l, w, h);

    let targetIndex = modelsData.length - 1; // Default to largest
    for (let i = 0; i < modelsData.length; i++) {
        if (maxDim < modelsData[i].maxDim) {
            targetIndex = i;
            break;
        }
    }

    const targetModel = loadedModels[targetIndex];
    if (targetModel) {
        referenceGroup.add(targetModel);
        // Aktiven Mixer setzen, falls Animationen vorhanden sind
        activeMixer = mixers[targetIndex] || null;

        if (labelReference) {
            labelReference.textContent = "Grössenreferenz (" + modelsData[targetIndex].name + ")";
        }
    }

    const targetData = modelsData[targetIndex];
    currentActiveModelSize = targetData.size;
    const paddingX = Math.max(targetData.size * targetData.paddingFactor, maxDim * targetData.paddingFactor) + 30;
    const paddingZ = Math.max(targetData.size * targetData.paddingFactor, maxDim * targetData.paddingFactor) + 30;
    referenceGroup.position.set((w / 2 + paddingX), 0, (l / 2 + paddingZ));
    
    // Setup Drag Controls
    if (!dragControls) {
        dragControls = new DragControls([referenceGroup], camera, renderer.domElement);
        dragControls.transformGroup = true;
        
        dragControls.addEventListener('hoveron', function(event) {
            controls.enabled = false; // Disable OrbitControls sofort beim Hovern
            document.body.style.cursor = 'grab';
            
            // Leuchteffekt aktivieren
            event.object.traverse((child) => {
                if (child.isMesh && child.material && child.material.emissive) {
                    if (child.userData.originalEmissive === undefined) {
                        child.userData.originalEmissive = child.material.emissive.getHex();
                    }
                    // Leichtes Grau/Weiss für das Aufleuchten
                    child.material.emissive.setHex(0x444444);
                }
            });
        });
        
        dragControls.addEventListener('hoveroff', function(event) {
            controls.enabled = true; 
            document.body.style.cursor = 'default';
            
            // Leuchteffekt zurücksetzen
            event.object.traverse((child) => {
                if (child.isMesh && child.material && child.userData.originalEmissive !== undefined) {
                    child.material.emissive.setHex(child.userData.originalEmissive);
                }
            });
        });
        
        dragControls.addEventListener('dragstart', function(event) {
            controls.enabled = false; 
            document.body.style.cursor = 'grabbing';
        });
        
        dragControls.addEventListener('drag', function(event) {
            // Sperre die Y-Achse, damit das Modell auf dem Boden bleibt
            event.object.position.y = 0; 
            
            // Kollisionsvermeidung mit dem Quader
            const l = parseFloat(inputLength.value) || 10;
            const w = parseFloat(inputWidth.value) || 10;
            
            // Ein Sicherheitsabstand abhängig von der Grösse des aktuellen Modells (ca. 40%)
            const safetyRadius = currentActiveModelSize * 0.4;
            
            // Ausgedehnte Sperrzone (Quader + Sicherheitsabstand)
            const expandedMinX = (-w / 2) - safetyRadius;
            const expandedMaxX = (w / 2) + safetyRadius;
            const expandedMinZ = (-l / 2) - safetyRadius;
            const expandedMaxZ = (l / 2) + safetyRadius;
            
            const px = event.object.position.x;
            const pz = event.object.position.z;
            
            // Wenn das Objekt in die Sperrzone eindringt, stossen wir es an die nächste Kante zurück
            if (px > expandedMinX && px < expandedMaxX && pz > expandedMinZ && pz < expandedMaxZ) {
                const distLeft = px - expandedMinX;
                const distRight = expandedMaxX - px;
                const distFront = pz - expandedMinZ;
                const distBack = expandedMaxZ - pz;
                
                const minDist = Math.min(distLeft, distRight, distFront, distBack);
                
                if (minDist === distLeft) event.object.position.x = expandedMinX;
                else if (minDist === distRight) event.object.position.x = expandedMaxX;
                else if (minDist === distFront) event.object.position.z = expandedMinZ;
                else if (minDist === distBack) event.object.position.z = expandedMaxZ;
            }
        });
        
        dragControls.addEventListener('dragend', function(event) {
            controls.enabled = true; 
            document.body.style.cursor = 'grab';
        });
    }

    toggleReference();
}

function adjustCamera() {
    const l = parseFloat(inputLength.value) || 10;
    const w = parseFloat(inputWidth.value) || 10;
    const h = parseFloat(inputHeight.value) || 10;
    const maxDim = Math.max(l, w, h);
    
    if (checkReference.checked) {
        let targetIndex = modelsData.length - 1;
        for (let i = 0; i < modelsData.length; i++) {
            if (maxDim < modelsData[i].maxDim) {
                targetIndex = i;
                break;
            }
        }
        const modelSize = modelsData[targetIndex].size;
        const overallMax = Math.max(maxDim, modelSize);
        // Faktor 3.5 um sehr grosse Referenzmodelle mitsamt Quader zu sehen
        camera.position.set(overallMax * 1.5, overallMax * 1.5, overallMax * 3.5);
    } else {
        camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 2.5);
    }
    
    controls.target.set(0, h / 2, 0);
    controls.update();
}

function createOrUpdateCoords(size) {
    if (gridHelper) scene.remove(gridHelper);
    if (axesHelper) scene.remove(axesHelper);
    gridHelper = new THREE.GridHelper(size, 20, 0x475569, 0x1e293b);
    scene.add(gridHelper);
    axesHelper = new THREE.AxesHelper(size / 2);
    scene.add(axesHelper);
    toggleCoords();
}

function createCuboid() {
    const l = parseFloat(inputLength.value) || 10;
    const w = parseFloat(inputWidth.value) || 10;
    const h = parseFloat(inputHeight.value) || 10;
    if (cuboidMesh) scene.remove(cuboidMesh);
    if (edgesMesh) scene.remove(edgesMesh);

    const maxDim = Math.max(l, w, h);
    createOrUpdateCoords(maxDim * 3);
    updateReferenceModel();

    const geometry = new THREE.BoxGeometry(w, h, l);
    const material = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 1.0,
        depthWrite: true
    });

    cuboidMesh = new THREE.Mesh(geometry, material);
    cuboidMesh.position.y = h / 2;
    scene.add(cuboidMesh);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    edgesMesh = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edgesMesh.position.y = h / 2;
    edgesMesh.visible = true;
    scene.add(edgesMesh);

    adjustCamera();
    updateMaterial();
}

function updateMaterial() {
    if (!cuboidMesh) return;
    const isTransparent = checkTransparent.checked;
    if (isTransparent) {
        cuboidMesh.material.opacity = 0.2;
        cuboidMesh.material.depthWrite = false;
    } else {
        cuboidMesh.material.opacity = 1.0;
        cuboidMesh.material.depthWrite = true;
    }
    cuboidMesh.material.needsUpdate = true;
}

function toggleCoords() {
    const show = checkCoords.checked;
    if (gridHelper) gridHelper.visible = show;
    if (axesHelper) axesHelper.visible = show;
}

function toggleReference() {
    if (referenceGroup) {
        referenceGroup.visible = checkReference.checked;
        if (dragControls) dragControls.enabled = checkReference.checked;
        adjustCamera();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    // --- ANIMATION UPDATE ---
    const delta = clock.getDelta();
    if (activeMixer && referenceGroup.visible) {
        activeMixer.update(delta);
    }
    
    controls.update();
    renderer.render(scene, camera);
}

init();
