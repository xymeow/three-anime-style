import * as T from "three";
export function studioRobot() {
  const root = new T.Group();
  root.name = "Studio robot";
  const clay = new T.MeshStandardMaterial({
    color: "#d0bfa0",
    roughness: 0.82,
  });
  const green = new T.MeshStandardMaterial({
    color: "#627a70",
    roughness: 0.65,
  });
  const dark = new T.MeshStandardMaterial({ color: "#2f393e", roughness: 0.7 });
  const orange = new T.MeshStandardMaterial({
    color: "#d57950",
    roughness: 0.7,
  });
  function part(
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
    parent: T.Object3D = root,
  ) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  part(new T.CylinderGeometry(0.63, 0.72, 1.3, 12), green, 0, 1.7, 0);
  const head = new T.Group();
  head.position.set(0, 2.67, 0);
  root.add(head);
  part(new T.BoxGeometry(1.43, 0.94, 0.96), clay, 0, 0, 0, head);
  part(new T.BoxGeometry(1.08, 0.36, 0.06), dark, 0, 0.02, 0.51, head);
  for (const x of [-0.28, 0.28])
    part(new T.SphereGeometry(0.09, 16, 12), orange, x, 0.02, 0.565, head);
  part(new T.CylinderGeometry(0.055, 0.055, 0.3, 8), dark, 0.47, 0.61, 0, head);
  part(new T.SphereGeometry(0.1, 12, 8), orange, 0.47, 0.79, 0, head);
  part(new T.BoxGeometry(0.48, 0.23, 0.08), clay, 0, 1.82, 0.69);
  const arms: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(side * 0.83, 2.12, 0);
    root.add(arm);
    arms.push(arm);
    part(new T.SphereGeometry(0.24, 16, 12), clay, 0, 0, 0, arm);
    part(new T.CylinderGeometry(0.17, 0.2, 0.8, 12), green, 0, -0.5, 0, arm);
    part(new T.SphereGeometry(0.23, 12, 8), dark, 0, -0.98, 0, arm);
    part(
      new T.CylinderGeometry(0.18, 0.22, 0.6, 12),
      dark,
      side * 0.36,
      0.79,
      0,
    );
    part(new T.BoxGeometry(0.47, 0.28, 0.72), clay, side * 0.36, 0.36, 0.15);
  }
  // Instancing and morph targets exercise the same material adapter used by imported GLBs.
  const pebbles = new T.InstancedMesh(
    new T.IcosahedronGeometry(0.16, 1),
    clay,
    5,
  );
  for (let i = 0; i < 5; i++) {
    const matrix = new T.Matrix4().makeTranslation(-1.3 + i * 0.65, 0.17, -1.3);
    pebbles.setMatrixAt(i, matrix);
  }
  root.add(pebbles);
  const morphGeo = new T.SphereGeometry(0.23, 16, 12);
  const positions = morphGeo.attributes.position.clone();
  for (let i = 0; i < positions.count; i++)
    positions.setY(i, positions.getY(i) * 1.7);
  morphGeo.morphAttributes.position = [positions];
  const morph = part(morphGeo, orange, 1.55, 0.28, 0.7);
  const ground = part(
    new T.CylinderGeometry(2.4, 2.45, 0.17, 64),
    new T.MeshStandardMaterial({ color: "#bac4ad", roughness: 1 }),
    0,
    0.06,
    0,
  );
  ground.receiveShadow = true;
  ground.userData.inkPaint = true;
  return {
    root,
    animate: (time: number) => {
      head.rotation.y = Math.sin(time * 0.8) * 0.28;
      arms.forEach(
        (a, i) => (a.rotation.z = Math.sin(time * 1.6 + i * 2) * 0.16),
      );
      morph.morphTargetInfluences![0] = (Math.sin(time * 2) + 1) * 0.5;
    },
  };
}
