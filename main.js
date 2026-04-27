import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Variables ---
let scene, camera, renderer, controls;
let cuboidMesh, edgesMesh;
let gridHelper, axesHelper, humanHelper;

// --- DOM Elements ---
const container = document.getElementById('canvas-container');
const btnCreate = document.getElementById('btn-create');
const inputLength = document.getElementById('input-length');
const inputWidth = document.getElementById('input-width');
const inputHeight = document.getElementById('input-height');
const checkTransparent = document.getElementById('check-transparent');
const checkCoords = document.getElementById('check-coords');
const checkHuman = document.getElementById('check-human');

// --- Initialization ---
function init() {
    // 1. Scene setup
    scene = new THREE.Scene();
    // Dark background matching the CSS theme
    scene.background = new THREE.Color(0x0f172a); 

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000000);
    camera.position.set(20, 20, 30);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. OrbitControls (for iPad touch and mouse interaction)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.zoomSpeed = 2.0; // Increased zoom sensitivity

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(10, 20, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-10, -20, -10);
    scene.add(dirLight2);

    // 6. Coordinate System (Grid & Axes) default
    createOrUpdateCoords(50); // Initial default size

    // 7. Human Reference
    createHumanHelper();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    btnCreate.addEventListener('click', createCuboid);
    checkTransparent.addEventListener('change', updateMaterial);
    checkCoords.addEventListener('change', toggleCoords);
    checkHuman.addEventListener('change', toggleHuman);

    // Start Animation Loop
    animate();
}

// --- Functions ---

function createHumanHelper() {
    humanHelper = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
        color: 0x94a3b8, // Slate gray
        roughness: 0.7,
        metalness: 0.1,
    });

    // Kopf (Mitte bei y=169, Höhe 22 => Spitze bei 180cm)
    const head = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 20), material);
    head.position.set(0, 169, 0);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(36, 56, 20), material);
    torso.position.set(0, 130, 0);

    // Beine
    const legGeo = new THREE.BoxGeometry(14, 85, 14);
    const legL = new THREE.Mesh(legGeo, material);
    legL.position.set(-10, 42.5, 0);
    const legR = new THREE.Mesh(legGeo, material);
    legR.position.set(10, 42.5, 0);

    // Arme
    const armGeo = new THREE.BoxGeometry(12, 60, 12);
    const armL = new THREE.Mesh(armGeo, material);
    armL.position.set(-25, 128, 0);
    const armR = new THREE.Mesh(armGeo, material);
    armR.position.set(25, 128, 0);

    humanHelper.add(head, torso, legL, legR, armL, armR);
    scene.add(humanHelper);
    
    toggleHuman();
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

    // Remove existing meshes if they exist
    if (cuboidMesh) scene.remove(cuboidMesh);
    if (edgesMesh) scene.remove(edgesMesh);

    const maxDim = Math.max(l, w, h);

    // Update Coordinate System to fit
    createOrUpdateCoords(maxDim * 3); // Grid 3 times the max dimension

    // Position human helper outside the cuboid (front-left corner)
    if (humanHelper) {
        humanHelper.position.set(-(w / 2 + 40), 0, (l / 2 + 40));
    }

    // Create Geometry
    // In Three.js usually Y is up, so Height maps to Y, Width to X, Length to Z.
    const geometry = new THREE.BoxGeometry(w, h, l);

    // Create Material (transparent: true is set initially to fix toggling issues)
    const material = new THREE.MeshStandardMaterial({
        color: 0x3b82f6, // Accent color
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 1.0,
        depthWrite: true
    });

    cuboidMesh = new THREE.Mesh(geometry, material);
    
    // Position it so the bottom rests on the grid
    cuboidMesh.position.y = h / 2;

    scene.add(cuboidMesh);

    // Create Edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    edgesMesh = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edgesMesh.position.y = h / 2;
    edgesMesh.visible = true; // Always show edges
    
    scene.add(edgesMesh);

    // Adjust Camera to fit new size
    // Zoom out enough to show the entire object (2.5 multiplier)
    camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 2.5);
    controls.target.set(0, h / 2, 0);
    controls.update();

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
    gridHelper.visible = show;
    axesHelper.visible = show;
}

function toggleHuman() {
    if (humanHelper) {
        humanHelper.visible = checkHuman.checked;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // required if controls.enableDamping or controls.autoRotate are set
    renderer.render(scene, camera);
}

// --- Start ---
init();
