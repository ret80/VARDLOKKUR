/* primitive.vert — Vertex shader для PrimitiveBatcher */

precision mediump float;

attribute vec2 a_position;
attribute vec4 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;

varying vec4 v_color;

void main() {
  v_color = a_color;
  gl_Position = u_projection * u_view * vec4(a_position, 0.0, 1.0);
}
