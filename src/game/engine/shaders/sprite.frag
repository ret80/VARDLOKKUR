/* sprite.frag — Fragment shader для SpriteBatcher */

precision mediump float;

varying vec2 v_uv;
varying vec4 v_color;
varying float v_textureIndex;

uniform sampler2D u_textures[8];

void main() {
  vec4 tex = vec4(1.0);
  int idx = int(v_textureIndex);
  
  // WebGL 1.0: условный оператор для выборки из массива текстур
  if (idx == 0) tex = texture2D(u_textures[0], v_uv);
  else if (idx == 1) tex = texture2D(u_textures[1], v_uv);
  else if (idx == 2) tex = texture2D(u_textures[2], v_uv);
  else if (idx == 3) tex = texture2D(u_textures[3], v_uv);
  else if (idx == 4) tex = texture2D(u_textures[4], v_uv);
  else if (idx == 5) tex = texture2D(u_textures[5], v_uv);
  else if (idx == 6) tex = texture2D(u_textures[6], v_uv);
  else if (idx == 7) tex = texture2D(u_textures[7], v_uv);
  
  if (tex.a < 0.01) discard;
  gl_FragColor = tex * v_color;
}
