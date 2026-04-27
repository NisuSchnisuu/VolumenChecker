import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let cuboidMesh, edgesMesh;
let gridHelper, axesHelper;
let referenceGroup;
const clock = new THREE.Clock();

const modelsData = [
    { file: 'bananaforscale-20cm.glb', size: 20, name: 'Banane 20cm', maxDim: 50, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'chair-1m.glb', size: 100, name: 'Stuhl 1m', maxDim: 150, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'human-1.8m.glb', size: 180, name: 'Mensch 1.8m', maxDim: 250, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'car-3.3m.glb', size: 330, name: 'Auto 3.3m', maxDim: 600, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    { file: 'house-9m.glb', size: 900, name: 'Haus 9m', maxDim: 2000, rotationY: -Math.PI / 4, paddingFactor: 0.5 },
    // Der Wal erhält einen expliziten max-Wert, da Skinned Meshes bei Box3 oft fehlschlagen. 
    // rotationY = 0 sorgt dafür, dass er parallel zur Z-Achse schwimmt und nicht kollidiert.
    { file: 'bluewhale-30m.glb', size: 3000, name: 'Blauwal 30m', maxDim: 10000, rotationY: 0, paddingFactor: 0.8, trueSizeMax: 30.1 }, 
    { file: 'eiffel tower-330m.glb', size: 33000, name: 'Eiffelturm 330m', maxDim: Infinity, rotationY: -Math.PI / 4, paddingFactor: 0.5 }
];
const loadedModels = {};
const mixers = {}; // Speichert die AnimationMixers für die jeweiligen Modelle
let activeMixer = null;

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
            
            let max;
            if (data.trueSizeMax) {
                max = data.trueSizeMax;
                // Trotz Override wollen wir die Box3 nutzen, um den Mittelpunkt zu finden
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                model.position.set(-center.x, -center.y, -center.z);
            } else {
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                max = Math.max(size.x, size.y, size.z);
                if (max === 0) return;
                model.position.set(-center.x, -center.y, -center.z);
            }

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
    const paddingX = Math.max(targetData.size * targetData.paddingFactor, maxDim * targetData.paddingFactor) + 30;
    const paddingZ = Math.max(targetData.size * targetData.paddingFactor, maxDim * targetData.paddingFactor) + 30;
    referenceGroup.position.set(-(w / 2 + paddingX), 0, (l / 2 + paddingZ));
    
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
