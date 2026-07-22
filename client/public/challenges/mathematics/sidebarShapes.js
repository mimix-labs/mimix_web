// sidebarShapes.js
// Renderiza vistas previas de figuras 3D en el sidebar

// Definición de las formas disponibles con sus colores
export const SHAPES = [
  {
    name: "cubo",
    id: "preview-cube",
    color: 0x9370DB,
    geometry: new THREE.BoxGeometry(1.5, 1.5, 1.5)
  },
  {
    name: "octaedro",
    id: "preview-octahedron",
    color: 0x00FFFF,
    geometry: new THREE.OctahedronGeometry(1.2)
  },
  {
    name: "prisma",
    id: "preview-prism",
    color: 0xFF0000,
    geometry: new THREE.CylinderGeometry(1, 1, 1.8, 6, 1) // Prisma hexagonal
  },
  {
    name: "piramide",
    id: "preview-pyramid",
    color: 0xFFD700,
    geometry: new THREE.ConeGeometry(1, 1.8, 4) // Pirámide cuadrangular
  }
];

function renderPreview(canvasId, geometry, color = 0x111111) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`No se encontró el canvas con ID: ${canvasId}`);
    return;
  }
  
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setSize(canvas.width, canvas.height);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 3;
  const material = new THREE.MeshStandardMaterial({ color, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Luz
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(2, 2, 5);
  scene.add(light);

  // Animación simple
  function animate() {
    mesh.rotation.y += 0.01;
    mesh.rotation.x += 0.005;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

// Esperar a que el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
  // Renderiza todas las figuras usando el array SHAPES
  SHAPES.forEach(shape => {
    renderPreview(shape.id, shape.geometry, shape.color);
  });
});

