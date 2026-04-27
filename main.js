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
    { file: 'Pin-3cm.glb', size: 3, name: 'Pin 3cm', maxDim: 10, rotationY: 0, paddingFactor: 0.5 },
    { file: 'bananaforscale-20cm.glb', size: 20, name: 'Banane 20cm', maxDim: 50, rotationY: 0, paddingFactor: 0.5 },
    { file: 'chair-1m.glb', size: 100, name: 'Stuhl 1m', maxDim: 150, rotationY: Math.PI, paddingFactor: 0.5 },
    { file: 'human-1.8m.glb', size: 180, name: 'Mensch 1.8m', maxDim: 250, rotationY: 0, paddingFactor: 0.5 },
    { file: 'car-3.3m.glb', size: 330, name: 'Auto 3.3m', maxDim: 600, rotationY: 0, paddingFactor: 0.5 },
    { file: 'house-9m.glb', size: 1000, name: 'Haus 9m', maxDim: 2000, rotationY: 0, paddingFactor: 0.5 },
    // Der Wal erhält einen expliziten max-Wert, da Skinned Meshes bei Box3 oft fehlschlagen. 
    // rotationY = 0 sorgt dafür, dass er parallel zur Z-Achse schwimmt und nicht kollidiert.
    // Blauwal Blender Dims: X: 10.2, Y: 30.1, Z: 5.04. trueSizeMax überschreibt SkinnedMesh-Fehler. hitboxSize fixt die schwebende BoundingBox.
    { file: 'bluewhale-30m.glb', size: 3000, name: 'Blauwal 30m', maxDim: 10000, rotationY: 0, paddingFactor: 0.8, trueSizeMax: 30.1, hitboxSize: [10.2, 30.1, 5.04] }, 
    { file: 'eiffel tower-330m.glb', size: 33000, name: 'Eiffelturm 330m', maxDim: Infinity, rotationY: 0, paddingFactor: 0.5 }
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
            pivotGroup.rotation.y = data.rotationY !== undefined ? data.rotationY : 0; 

            // Unsichtbare Hitbox hinzufügen, da Skinned Meshes (Animationen) oft Probleme mit Raycastern haben
            // Nutzen der originalen Proportionen (size) anstatt eines gigantischen Würfels (max, max, max), 
            // damit Modelle wie der Wal nicht künstlich hoch in die Luft gehoben werden.
            const hSize = data.hitboxSize ? new THREE.Vector3(data.hitboxSize[0], data.hitboxSize[1], data.hitboxSize[2]) : size;
            const hitboxGeo = new THREE.BoxGeometry(hSize.x, hSize.y, hSize.z);
            // Hitbox wieder unsichtbar gemacht
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
    // Padding skaliert jetzt 100% proportional zur Modellgrösse. 
    // paddingFactor (z.B. 0.5 = halbe Grösse) + 20% extra als visuelle Lücke.
    const gap = targetData.size * 0.2;
    const paddingX = (targetData.size * targetData.paddingFactor) + gap;
    const paddingZ = (targetData.size * targetData.paddingFactor) + gap;
    
    // Position speichern und anwenden, damit wir sie später (z.B. beim Toggle) wiederherstellen können
    referenceGroup.userData.originalPosition = new THREE.Vector3((w / 2 + paddingX), 0, (l / 2 + paddingZ));
    referenceGroup.position.copy(referenceGroup.userData.originalPosition);
    
    // Setup Drag Controls
    if (!dragControls) {
        dragControls = new DragControls([referenceGroup], camera, renderer.domElement);
        dragControls.transformGroup = true;
        
        dragControls.addEventListener('hoveron', function(event) {
            controls.enabled = false; // Disable OrbitControls sofort beim Hovern
            document.body.style.cursor = 'grab';
        });
        
        dragControls.addEventListener('hoveroff', function(event) {
            controls.enabled = true; 
            document.body.style.cursor = 'default';
        });
        
        dragControls.addEventListener('dragstart', function(event) {
            controls.enabled = false; 
            document.body.style.cursor = 'grabbing';
        });
        
        dragControls.addEventListener('drag', function(event) {
            // Sperre die Y-Achse, damit das Modell auf dem Boden bleibt
            event.object.position.y = 0; 
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
    
    // Eigene dicke 3D-Pfeile anstelle des sehr dünnen Standard-AxesHelper
    axesHelper = new THREE.Group();
    const thickness = Math.max(0.01, size * 0.0003); // Extrem dünn, fast wie Linien
    const headRadius = thickness * 6; // Pfeilspitze muss proportional etwas breiter bleiben
    const headLength = thickness * 12;
    const bodyLength = size - headLength; // Volle Länge (-size/2 bis +size/2)
    
    // Ohne depthTest=false, damit die Achsen ganz natürlich von Objekten verdeckt werden
    const matX = new THREE.MeshBasicMaterial({ color: 0xef4444 }); 
    const matY = new THREE.MeshBasicMaterial({ color: 0x22c55e }); 
    const matZ = new THREE.MeshBasicMaterial({ color: 0x3b82f6 }); 
    
    // X Axis (Rot)
    const meshBodyX = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, bodyLength, 8), matX);
    meshBodyX.rotation.z = -Math.PI / 2;
    meshBodyX.position.x = -headLength / 2; // Zentriert die Achse exakt auf den Nullpunkt
    const meshHeadX = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 8), matX);
    meshHeadX.rotation.z = -Math.PI / 2;
    meshHeadX.position.x = (size / 2) - headLength / 2;
    axesHelper.add(meshBodyX, meshHeadX);
    
    // Y Axis (Grün)
    const meshBodyY = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, bodyLength, 8), matY);
    meshBodyY.position.y = -headLength / 2;
    const meshHeadY = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 8), matY);
    meshHeadY.position.y = (size / 2) - headLength / 2;
    axesHelper.add(meshBodyY, meshHeadY);
    
    // Z Axis (Blau)
    const meshBodyZ = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, bodyLength, 8), matZ);
    meshBodyZ.rotation.x = Math.PI / 2;
    meshBodyZ.position.z = -headLength / 2;
    const meshHeadZ = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 8), matZ);
    meshHeadZ.rotation.x = Math.PI / 2;
    meshHeadZ.position.z = (size / 2) - headLength / 2;
    axesHelper.add(meshBodyZ, meshHeadZ);
    
    scene.add(axesHelper);
    
    toggleCoords();
}

function createCuboid() {
    if (!inputLength.value || !inputWidth.value || !inputHeight.value) {
        alert("Bitte fülle alle drei Werte (Länge, Breite, Höhe) aus!");
        if (!inputLength.value) inputLength.focus();
        else if (!inputWidth.value) inputWidth.focus();
        else if (!inputHeight.value) inputHeight.focus();
        return;
    }

    const l = parseFloat(inputLength.value);
    const w = parseFloat(inputWidth.value);
    const h = parseFloat(inputHeight.value);
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

    // Ersetze die fehleranfälligen LineSegments durch echte 3D-Zylinder, die sauber mitskalieren
    edgesMesh = new THREE.Group();
    // Die Mindestdicke reduziert, damit kleine Quader keine zu fetten Kanten haben.
    const edgeThickness = Math.max(0.02, maxDim * 0.0015);
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    function addEdge(len, rotX, rotZ, posX, posY, posZ) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(edgeThickness, edgeThickness, len, 8), edgeMaterial);
        cyl.rotation.set(rotX, 0, rotZ);
        cyl.position.set(posX, posY, posZ);
        edgesMesh.add(cyl);
    }
    
    const hw = w/2, hh = h/2, hl = l/2;
    
    // 4 Kanten entlang der X-Achse (Breite)
    addEdge(w, 0, Math.PI/2, 0, hh, hl);
    addEdge(w, 0, Math.PI/2, 0, hh, -hl);
    addEdge(w, 0, Math.PI/2, 0, -hh, hl);
    addEdge(w, 0, Math.PI/2, 0, -hh, -hl);
    
    // 4 Kanten entlang der Y-Achse (Höhe)
    addEdge(h, 0, 0, hw, 0, hl);
    addEdge(h, 0, 0, hw, 0, -hl);
    addEdge(h, 0, 0, -hw, 0, hl);
    addEdge(h, 0, 0, -hw, 0, -hl);
    
    // 4 Kanten entlang der Z-Achse (Länge)
    addEdge(l, Math.PI/2, 0, hw, hh, 0);
    addEdge(l, Math.PI/2, 0, hw, -hh, 0);
    addEdge(l, Math.PI/2, 0, -hw, hh, 0);
    addEdge(l, Math.PI/2, 0, -hw, -hh, 0);

    edgesMesh.position.y = h / 2;
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
        
        // Position auf die Ausgangsposition zurücksetzen, wenn aktiviert
        if (checkReference.checked && referenceGroup.userData.originalPosition) {
            referenceGroup.position.copy(referenceGroup.userData.originalPosition);
        }
        
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
