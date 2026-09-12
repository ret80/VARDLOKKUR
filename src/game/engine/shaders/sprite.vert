/* sprite.vert — Vertex shader для SpriteBatcher */

precision mediump float;

attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
attribute float a_textureIndex;

uniform mat4 u_projection;
uniform mat4 u_view;

varying vec2 v_uv;
varying vec4 v_color;
varying float v_textureIndex;

void main() {
  v_uv = a_uv;
  v_color = a_color;
  v_textureIndex = a_textureIndex;
  gl_Position = u_projection * u_view * vec4(a_position, 0.0, 1.0);
}
