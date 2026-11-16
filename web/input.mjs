// Match the native camera mapping, including its exact neutral value.
export function cameraAxis(value,inverted) {
  return inverted&&value!==128?255-value:value;
}
