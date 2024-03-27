@vertex
fn vertexMain(@location(0) pos: vec4f) -> @builtin(position) vec4f {
    return vec4f(pos.xy,0,1);
}