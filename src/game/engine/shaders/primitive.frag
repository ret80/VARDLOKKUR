/* primitive.frag — Fragment shader для PrimitiveBatcher */

precision mediump float;

varying vec4 v_color;

void main() {
  if (v_color.a < 0.01) discard;
  gl_FragColor = v_color;
}
