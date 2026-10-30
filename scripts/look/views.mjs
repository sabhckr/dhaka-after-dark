/**
 * Fixed golden views: three districts, each at street, medium and aerial distance.
 * Street points are road centrelines checked to be clear of building footprints.
 * Conditions map to the game's own look and weather ids.
 */
const DISTRICTS = {
  kawran: { x: 4277.4, z: -14083.0, yaw: -2.849 },
  oldDhaka: { x: 5473.6, z: -9632.7, yaw: -2.216 },
  gulshan: { x: 6714.7, z: -17305.2, yaw: -1.337 },
};

const DISTANCES = {
  street: { y: 1.8, pitch: 0, back: 0 },
  medium: { y: 45, pitch: -0.32, back: 120 },
  aerial: { y: 320, pitch: -0.42, back: 650 },
};

export const CONDITIONS = [
  { id: "day", look: "day", weather: "clear" },
  { id: "night", look: "neon", weather: "clear" },
  { id: "rain", look: "wet", weather: "rain" },
];

export const VIEWS = Object.entries(DISTRICTS).flatMap(([district, d]) =>
  Object.entries(DISTANCES).map(([distance, k]) => {
    // Step back along the view direction so the district point stays in frame.
    const fx = -Math.sin(d.yaw);
    const fz = -Math.cos(d.yaw);
    return {
      id: `${district}-${distance}`,
      district,
      distance,
      x: +(d.x - fx * k.back).toFixed(1),
      y: k.y,
      z: +(d.z - fz * k.back).toFixed(1),
      yaw: d.yaw,
      pitch: k.pitch,
    };
  }),
);
