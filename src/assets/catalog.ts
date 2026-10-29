import type * as THREE from "three";
import { tag, weld } from "./kit.ts";
import { buildHuman, NPC_SPECS } from "./human.ts";
import {
  buildAhsan,
  buildAirportInterior,
  buildBillboard,
  buildBookStall,
  buildBoundaryWall,
  buildBusInterior,
  buildClothStall,
  buildCurzon,
  buildDailyStall,
  buildFlowerStall,
  buildFlyover,
  buildFoodStall,
  buildFootbridge,
  buildKawran,
  buildLalbagh,
  buildMuseum,
  buildNewMarket,
  buildPhoneStall,
  buildRiver,
  buildRoadDiorama,
  buildRooftop,
  buildSangsad,
  buildStreetLight,
  buildTeaStall,
  buildTrees,
  buildUtilityPole,
} from "./places.ts";
import {
  buildAircraft,
  buildBusStand,
  buildMetroStation,
  buildMetroTrack,
  buildMetroTrain,
  buildRailStation,
  buildRailTrack,
  buildRailTrain,
  buildTerminal,
  TRANSIT_NOTES,
} from "./transit.ts";
import {
  buildAxio,
  buildBrtc,
  buildCng,
  buildCycleRickshaw,
  buildEasyBike,
  buildGreenLine,
  buildHanif,
  buildMotorcycle,
  buildMustang,
  buildPoliceCruiser,
  buildPoliceHilux,
  buildPoliceSedan,
  buildPremio,
  buildSaintmartin,
  buildSakura,
  buildShyamoli,
  VEHICLE_NOTES,
} from "./vehicles.ts";

export const ASSET_STATUSES = ["NOT STARTED", "BLOCKOUT", "MODELED", "TEXTURED", "INTEGRATED", "VERIFIED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type AssetRecord = {
  id: string;
  name: string;
  category: string;
  status: AssetStatus;
  summary: string;
  evidence: string;
  build: () => THREE.Group;
};

export type Placement = {
  assetId: string;
  x: number;
  z: number;
  yaw: number;
  /** World Y of the model origin. Default sits on the road datum. */
  y: number;
  where: string;
};

const SHOW = "Showroom model only. The live map already has OSM geometry here, so this mesh is not dropped on top of it.";

function entry(
  id: string,
  name: string,
  category: string,
  status: AssetStatus,
  summary: string,
  evidence: string,
  build: () => THREE.Group,
): AssetRecord {
  const record: AssetRecord = {
    id,
    name,
    category,
    status,
    summary,
    evidence,
    build: () => {
      const group = weld(build());
      group.name = id;
      tag(group, `${name} · ${record.status}`);
      return group;
    },
  };
  return record;
}

const npc = NPC_SPECS.map((row) =>
  entry(row.id, row.name, "NPC", "TEXTURED", "Posed figure with shared materials. No skeleton. The street population can instance this mesh; motion is procedural, not a clip.", row.evidence, () =>
    buildHuman(row.spec),
  ),
);

export const CATALOG: AssetRecord[] = [
  ...npc,
  entry("veh-easybike", "Easy-bike", "Vehicles", "TEXTURED", "Battery rickshaw, three wheels, fiberglass cabin.", VEHICLE_NOTES.easy, buildEasyBike),
  entry("veh-cng", "CNG", "Vehicles", "TEXTURED", "Green-and-black auto-rickshaw.", VEHICLE_NOTES.cng, buildCng),
  entry("veh-cycle-rickshaw", "Cycle rickshaw", "Vehicles", "TEXTURED", "Hooded cycle rickshaw.", VEHICLE_NOTES.cycle, buildCycleRickshaw),
  entry("veh-premio", "Toyota Premio", "Vehicles", "TEXTURED", "Silver Premio-proportion sedan.", VEHICLE_NOTES.premio, buildPremio),
  entry("veh-axio", "Toyota Axio", "Vehicles", "TEXTURED", "Shorter Axio-proportion sedan.", VEHICLE_NOTES.axio, buildAxio),
  entry("veh-mustang", "Mustang 1967", "Vehicles", "TEXTURED", "Vice City showcase fastback. Not a local fleet car.", VEHICLE_NOTES.mustang, buildMustang),
  entry("veh-motorcycle", "Motorcycle", "Vehicles", "TEXTURED", "Commuter bike.", VEHICLE_NOTES.moto, buildMotorcycle),
  entry("bus-greenline", "Green Line", "Buses", "TEXTURED", "Green-and-white coach.", VEHICLE_NOTES.coach, buildGreenLine),
  entry("bus-shyamoli", "Shyamoli", "Buses", "TEXTURED", "Red-and-cream coach.", VEHICLE_NOTES.coach, buildShyamoli),
  entry("bus-hanif", "Hanif", "Buses", "TEXTURED", "Blue-and-white coach.", VEHICLE_NOTES.coach, buildHanif),
  entry("bus-sakura", "Sakura", "Buses", "TEXTURED", "Pink-and-white coach.", VEHICLE_NOTES.coach, buildSakura),
  entry("bus-saintmartin", "Saintmartin", "Buses", "TEXTURED", "White coach with a blue stripe.", VEHICLE_NOTES.coach, buildSaintmartin),
  entry("bus-brtc", "BRTC double-decker", "Buses", "TEXTURED", "Red city double-decker.", VEHICLE_NOTES.coach, buildBrtc),
  entry("pol-hilux", "Police Hilux", "Police", "TEXTURED", "Blue beat pickup.", VEHICLE_NOTES.hilux, buildPoliceHilux),
  entry("pol-cruiser", "Police Land Cruiser", "Police", "TEXTURED", "Dark boxy SUV.", VEHICLE_NOTES.cruiser, buildPoliceCruiser),
  entry("pol-sedan", "Police sedan", "Police", "TEXTURED", "Marked blue sedan.", VEHICLE_NOTES.sedan, buildPoliceSedan),
  entry("metro-train", "Metro train", "Metro", "TEXTURED", "One MRT Line 6 car.", TRANSIT_NOTES.metroTrain, buildMetroTrain),
  entry("metro-track", "Metro viaduct", "Metro", "TEXTURED", "Piers, deck, rails, wire.", TRANSIT_NOTES.metroTrack, buildMetroTrack),
  entry("metro-station", "Metro station", "Metro", "TEXTURED", "Uttara-style concourse.", TRANSIT_NOTES.metroStation, buildMetroStation),
  entry("rail-train", "Benapole Express", "Railway", "TEXTURED", "Loco plus one coach.", TRANSIT_NOTES.railTrain, buildRailTrain),
  entry("rail-track", "Railway track", "Railway", "TEXTURED", "Ballast sample.", TRANSIT_NOTES.railTrack, buildRailTrack),
  entry("rail-station", "Kamalapur hall", "Railway", "TEXTURED", "Station hall, not the real shell roof.", TRANSIT_NOTES.railStation, buildRailStation),
  entry("air-terminal", "Shahjalal terminal bay", "Airport", "TEXTURED", "One terminal bay.", TRANSIT_NOTES.terminal, buildTerminal),
  entry("air-biman", "Biman-style jet", "Airport", "TEXTURED", "Green cheatline, red tail. No logo.", TRANSIT_NOTES.air, () =>
    buildAircraft({ body: 0xf7f4ee, stripe: 0x1f8a4c, tail: 0xc1121f, title: "BIMAN" }),
  ),
  entry("air-qatar", "Qatar-style jet", "Airport", "TEXTURED", "Burgundy tail. No logo.", TRANSIT_NOTES.air, () =>
    buildAircraft({ body: 0xf7f4ee, stripe: 0x6b1d3a, tail: 0x6b1d3a, title: "QATAR", wide: true }),
  ),
  entry("air-emirates", "Emirates-style jet", "Airport", "TEXTURED", "Gold cheatline. No logo.", TRANSIT_NOTES.air, () =>
    buildAircraft({ body: 0xf7f4ee, stripe: 0xd4a017, tail: 0xd4a017, title: "EMIRATES", wide: true }),
  ),
  entry("air-airindia", "Air India-style jet", "Airport", "TEXTURED", "Orange-red cheatline. No logo.", TRANSIT_NOTES.air, () =>
    buildAircraft({ body: 0xf7f4ee, stripe: 0xe23a3a, tail: 0xe23a3a, title: "AIR INDIA" }),
  ),
  entry("stand-gabtoli", "Gabtoli bay", "Airport", "TEXTURED", "Intercity shed bay.", TRANSIT_NOTES.gabtoli, () => buildBusStand("গাবতলী", 0xc23b4a)),
  entry("stand-mohakhali", "Mohakhali bay", "Airport", "TEXTURED", "Second terminal shed, different roof.", TRANSIT_NOTES.mohakhali, () =>
    buildBusStand("মহাখালী", 0x1d4e89),
  ),
  entry("hawk-kawran", "Kawran Bazar cluster", "Hawkers", "TEXTURED", "Three stalls under a tarp.", "Kawran Bazar is the wholesale market. This is a stall cluster, not the market sheds.", buildKawran),
  entry("hawk-newmarket", "New Market bay", "Hawkers", "TEXTURED", "Three shopfronts.", "New Market is a real Shahbagh arcade. This is one bay, not the building.", buildNewMarket),
  entry("hawk-food", "Street food stall", "Hawkers", "TEXTURED", "Cooked-food table.", "Generic footpath kitchen. No vendor name from OSM.", buildFoodStall),
  entry("hawk-phone", "Mobile accessories", "Hawkers", "TEXTURED", "Phone-cover stall.", "Generic accessories stall. No brand handsets.", buildPhoneStall),
  entry("hawk-book", "Book stall", "Hawkers", "TEXTURED", "Footpath books.", "Nilkhet and New Market both have these. Not a specific shop.", buildBookStall),
  entry("hawk-cloth", "Clothing stall", "Hawkers", "TEXTURED", "Hanging cloth and a table.", "Footpath clothing. Pattern is original.", buildClothStall),
  entry("hawk-daily", "Daily essentials", "Hawkers", "TEXTURED", "Small goods table.", "Generic mudir dokan table.", buildDailyStall),
  entry("hawk-tea", "Tea stall", "Hawkers", "TEXTURED", "Cha table, kettle, umbrella.", "The sign says চা. It is not a traced shopfront.", buildTeaStall),
  entry("hawk-flower", "Flower stall", "Hawkers", "TEXTURED", "Cut flowers.", "Shahbagh has a real flower market. This stall is the type, not a surveyed kiosk.", buildFlowerStall),
  entry("lm-sangsad", "Jatiya Sangsad", "Landmarks", "TEXTURED", "Disc and blocks.", `${SHOW} Louis Kahn's assembly building is a drum in a complex, not this simplified mass.`, buildSangsad),
  entry("lm-ahsan", "Ahsan Manzil", "Landmarks", "TEXTURED", "Pink palace block.", `${SHOW} The real palace faces the Buriganga and is already an OSM footprint.`, buildAhsan),
  entry("lm-lalbagh", "Lalbagh Fort", "Landmarks", "TEXTURED", "Red fort walls and a tomb.", `${SHOW} Mughal fort at Lalbagh. Walls are a blockout.`, buildLalbagh),
  entry("lm-museum", "National Museum", "Landmarks", "TEXTURED", "Shahbagh museum block.", `${SHOW} Bangladesh National Museum, Shahbagh.`, buildMuseum),
  entry("lm-curzon", "Curzon Hall", "Landmarks", "TEXTURED", "Red academic block with a dome.", `${SHOW} The sheet's university photo reads as Curzon Hall, Dhaka University, not the whole campus.`, buildCurzon),
  entry("infra-footbridge", "Footbridge", "Infrastructure", "TEXTURED", "Deck, rails, two stair runs.", "The live map already builds OSM footbridges. This is the showroom module, not a second bridge in the world.", buildFootbridge),
  entry("infra-flyover", "Flyover", "Infrastructure", "TEXTURED", "Short elevated deck and two piers.", "OSM already marks vehicle bridges. This segment is not laid over a real flyover.", buildFlyover),
  entry("infra-road", "Road and sidewalk", "Infrastructure", "TEXTURED", "Asphalt, curbs, a lane dash.", "Sample cross-section. City roads stay on their OSM centerlines.", buildRoadDiorama),
  entry("infra-lamp", "Street light", "Infrastructure", "TEXTURED", "Pole and warm head.", "The city dressing already instances lamps. This is the standalone model.", buildStreetLight),
  entry("infra-trees", "Trees", "Infrastructure", "TEXTURED", "Shade tree and a palm.", "Canopy color matches the city grade. Not a botanical survey.", buildTrees),
  entry("infra-river", "River edge", "Infrastructure", "TEXTURED", "Bank and water.", "Buriganga-colored water. The real river polygon is already in the map.", buildRiver),
  entry("infra-billboard", "Billboard", "Infrastructure", "TEXTURED", "Two posts and a painted face.", "Original poster. No scanned advertisement.", buildBillboard),
  entry("infra-pole", "Utility pole", "Infrastructure", "TEXTURED", "Pole, crossarm, three wires.", "Tangled service drops are already streamed per chunk. This is one pole.", buildUtilityPole),
  entry("infra-wall", "Boundary wall", "Infrastructure", "TEXTURED", "Brick wall, pillars, a gate.", "Generic compound wall.", buildBoundaryWall),
  entry("infra-roof", "Rooftop", "Infrastructure", "TEXTURED", "Tank, stair, dish, washing.", "The same rooftop pieces the city already scatters, gathered as one prop.", buildRooftop),
  entry("infra-bus-hall", "Bus terminal interior", "Infrastructure", "TEXTURED", "Cutaway benches and a bay.", "Interior diorama. Not Gabtoli's measured hall.", buildBusInterior),
  entry("infra-air-hall", "Airport interior", "Infrastructure", "TEXTURED", "Check-in desks and a belt.", "Interior diorama. Not a terminal floor plan.", buildAirportInterior),
];

/**
 * Props that actually stand in the city.
 * Coordinates are beside spawn pads, on the local ground datum, not surveyed curb points.
 */
export const PLACEMENTS: Placement[] = [
  { assetId: "npc-police", x: 2768, z: -15448, yaw: 0, y: 0.3, where: "Sangsad service road, north of the spawn pad" },
  { assetId: "npc-genz-m", x: 2784, z: -15448, yaw: 0.2, y: 0.3, where: "Sangsad service road" },
  { assetId: "npc-genz-f", x: 2798, z: -15446, yaw: -0.15, y: 0.3, where: "Sangsad service road" },
  { assetId: "npc-burqa", x: 2814, z: -15448, yaw: 0, y: 0.3, where: "Sangsad service road" },
  { assetId: "npc-huzur", x: 2830, z: -15446, yaw: 0.1, y: 0.3, where: "Sangsad service road" },
  { assetId: "npc-hawker", x: 2848, z: -15448, yaw: 0, y: 0.3, where: "Sangsad service road" },
  { assetId: "npc-stall", x: 2868, z: -15440, yaw: Math.PI, y: 0.3, where: "Sangsad service road" },
  { assetId: "veh-cycle-rickshaw", x: 2775, z: -15472, yaw: Math.PI / 2, y: 0.3, where: "Sangsad service road" },
  { assetId: "veh-cng", x: 2808, z: -15474, yaw: Math.PI / 2, y: 0.3, where: "Sangsad service road" },
  { assetId: "veh-motorcycle", x: 2836, z: -15474, yaw: Math.PI / 2, y: 0.3, where: "Sangsad service road" },
  { assetId: "pol-sedan", x: 2868, z: -15476, yaw: Math.PI / 2, y: 0.3, where: "Sangsad service road" },
  { assetId: "bus-greenline", x: 2820, z: -15498, yaw: Math.PI / 2, y: 0.3, where: "Sangsad service road, south shoulder" },
  { assetId: "hawk-flower", x: 4608, z: -12790, yaw: 0.4, y: 0.3, where: "Shahbagh, east of the spawn. The real flower market is in this neighborhood; this stall is not a surveyed kiosk." },
  { assetId: "hawk-tea", x: 4628, z: -12770, yaw: -0.2, y: 0.3, where: "Shahbagh spawn shoulder" },
  { assetId: "npc-student-f", x: 4588, z: -12760, yaw: 0.6, y: 0.3, where: "Shahbagh" },
  { assetId: "npc-student-m", x: 4598, z: -12748, yaw: 1, y: 0.3, where: "Shahbagh" },
  { assetId: "veh-easybike", x: 4220, z: -27090, yaw: 0.4, y: 0.3, where: "Uttara. Easy-bikes are a fringe vehicle, so this one is not parked at Sangsad." },
  { assetId: "metro-track", x: 4320, z: -27140, yaw: Math.PI / 2, y: 0, where: "Uttara display viaduct, not the Line 6 alignment" },
  { assetId: "metro-train", x: 4320, z: -27140, yaw: Math.PI / 2, y: 5.2, where: "Sitting on the display viaduct" },
  { assetId: "rail-train", x: 7680, z: -11950, yaw: 0.2, y: 0.3, where: "Kamalapur spawn, offset from the station footprint" },
  { assetId: "air-biman", x: 4780, z: -24240, yaw: 0.5, y: 0.3, where: "Shahjalal spawn, offset so it is not inside the terminal mass" },
];

const placed = new Set(PLACEMENTS.map((p) => p.assetId));
for (const asset of CATALOG) {
  if (placed.has(asset.id)) asset.status = "INTEGRATED";
}

export function assetById(id: string): AssetRecord | undefined {
  return CATALOG.find((asset) => asset.id === id);
}

export function catalogCategories(): string[] {
  const seen: string[] = [];
  for (const asset of CATALOG) if (!seen.includes(asset.category)) seen.push(asset.category);
  return seen;
}
