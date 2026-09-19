import * as T from "three";

/** Flat, abstract shadow patch for the lab's horizontal y=0 stage. */
export function createContactShadow() {
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      color: { value: new T.Color("#20233e") },
      opacity: { value: 0.48 },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `varying vec2 vUv; uniform vec3 color; uniform float opacity;
      void main(){
        vec2 p=(vUv-.5)*2.0;
        float a=atan(p.y,p.x);
        float edge=length(p)+.045*sin(a*3.0+.7)+.025*cos(a*5.0);
        float aa=max(fwidth(edge),.003);
        float mask=1.0-smoothstep(.85-aa,.85+aa,edge);
        if(mask<.001)discard;
        gl_FragColor=vec4(color,mask*opacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.scale.set(2.2, 1.3, 1);
  mesh.renderOrder = 1;
  mesh.name = "Abstract cel contact shadow";
  mesh.visible = false;
  return mesh;
}
